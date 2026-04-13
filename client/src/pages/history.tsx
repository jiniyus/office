import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, Search, Trash2, Calendar, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTransactions, useLocations } from "@/lib/firestore-hooks";
import { useState, useMemo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { format } from "date-fns";
import { capitalize } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp, updateDoc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface HistoryProcessItem {
  itemId: string;
  itemName: string;
  category: string;
  quantity: number;
}

interface HistoryStockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  heatTreatmentBalance: number;
  factoryBalance: number;
  officeBalance: number;
}

interface HistoryProcessTransaction {
  id: string;
  itemId: string;
  category: string;
  quantityChange: number;
  type: string;
}

export default function HistoryPage() {
  const { transactions, loading } = useTransactions();
  const { locations } = useLocations();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [expandedBulkId, setExpandedBulkId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<any>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [expandedSalesFilter, setExpandedSalesFilter] = useState(false);
  const { toast } = useToast();

  const getItemKey = (itemName: string, category: string) =>
    `${itemName.toLowerCase()}::${category.toLowerCase()}`;

  const reverseHeatTreatmentProcess = async (processId: string) => {
    const [processSnapshot, processTxSnapshot, stockItemsSnapshot] = await Promise.all([
      getDoc(doc(db, "processes", processId)),
      getDocs(query(collection(db, "transactions"), where("processId", "==", processId))),
      getDocs(
        user?.company
          ? query(collection(db, "stock-items"), where("company", "==", user.company))
          : query(collection(db, "stock-items"))
      ),
    ]);

    const processTransactions: HistoryProcessTransaction[] = processTxSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as HistoryProcessTransaction))
      .filter((tx) => tx.type === "heat_treatment_created");

    if (processTransactions.length === 0) {
      return 0;
    }

    const currentProcessItems: HistoryProcessItem[] = processSnapshot.exists()
      ? ((processSnapshot.data().items ?? []) as HistoryProcessItem[])
      : [];

    const originalQtyByKey = new Map<string, number>();
    for (const tx of processTransactions) {
      const itemKey = getItemKey(tx.itemId, tx.category);
      const currentQty = originalQtyByKey.get(itemKey) ?? 0;
      originalQtyByKey.set(itemKey, currentQty + Math.max(0, tx.quantityChange || 0));
    }

    const remainingQtyByKey = new Map<string, number>();
    for (const item of currentProcessItems) {
      const itemKey = getItemKey(item.itemName, item.category);
      const currentQty = remainingQtyByKey.get(itemKey) ?? 0;
      remainingQtyByKey.set(itemKey, currentQty + (item.quantity || 0));
    }

    const stockItemsByKey = new Map<string, HistoryStockItem>();
    stockItemsSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const stockItem: HistoryStockItem = {
        id: docSnap.id,
        name: data.name,
        category: data.category,
        quantity: data.quantity || 0,
        heatTreatmentBalance: data.heatTreatmentBalance || 0,
        factoryBalance: data.factoryBalance || 0,
        officeBalance: data.officeBalance || 0,
      };

      stockItemsByKey.set(getItemKey(stockItem.name, stockItem.category), stockItem);
    });

    for (const [itemKey, originalQty] of Array.from(originalQtyByKey.entries())) {
      const stockItem = stockItemsByKey.get(itemKey);
      if (!stockItem) continue;

      const remainingInHT = remainingQtyByKey.get(itemKey) ?? 0;
      const qtyAlreadyTransferredDownstream = Math.max(0, originalQty - remainingInHT);

      const nextHTBalance = Math.max(0, stockItem.heatTreatmentBalance - remainingInHT);

      let remainingCascadeQty = qtyAlreadyTransferredDownstream;
      const officeDeduction = Math.min(stockItem.officeBalance, remainingCascadeQty);
      const nextOFBalance = stockItem.officeBalance - officeDeduction;
      remainingCascadeQty -= officeDeduction;

      const factoryDeduction = Math.min(stockItem.factoryBalance, remainingCascadeQty);
      const nextFABalance = stockItem.factoryBalance - factoryDeduction;

      await updateDoc(doc(db, "stock-items", stockItem.id), {
        heatTreatmentBalance: nextHTBalance,
        factoryBalance: nextFABalance,
        officeBalance: nextOFBalance,
        quantity: nextHTBalance + nextFABalance + nextOFBalance,
        lastUpdated: Timestamp.now(),
      });
    }

    if (processSnapshot.exists()) {
      await deleteDoc(doc(db, "processes", processId));
    }

    await Promise.all(
      processTransactions.map((tx: any) => deleteDoc(doc(db, "transactions", tx.id)))
    );

    return processTransactions.length;
  };

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    
    if (selectedDate) {
      result = result.filter(tx => {
        const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
        return txDate === selectedDate;
      });
    }
    
    if (selectedFilters.length > 0) {
      result = result.filter(tx => {
        if (selectedFilters.includes('heat_treatment') && tx.processId && tx.type === 'heat_treatment_created') {
          return true;
        }
        if (selectedFilters.includes('transfer_factory') && tx.transferId && tx.type === 'factory_transfer_created') {
          return true;
        }
        if (selectedFilters.includes('transfer_office') && tx.transferId && tx.type === 'office_transfer_created') {
          return true;
        }
        const salesFilters = selectedFilters.filter(f => f.startsWith('sales:'));
        if (salesFilters.length > 0 && tx.salesId) {
          const companies = salesFilters.map(f => f.replace('sales:', ''));
          return tx.salesCompany ? companies.includes(tx.salesCompany) : false;
        }
        return false;
      });
    }
    
    return result;
  }, [transactions, selectedDate, selectedFilters]);

  const canReverseDelete = deleteConfirmId
    ? deleteConfirmId.isBulkGroup
      ? deleteConfirmId.type !== "transfer"
      : (() => {
          const tx = filteredTransactions.find(t => t.id === deleteConfirmId.id);
          return tx
            ? tx.type !== "factory_transfer_created" && tx.type !== "office_transfer_created"
            : true;
        })()
    : false;

  const handleDeleteTransaction = async (idOrBulkId: string, isBulkId: boolean = false) => {
    try {
      if (isBulkId) {
        // Check if this is a bulkTransactionId, processId, transferId, or salesId
        const allBulkTxs = filteredTransactions.filter(tx => tx.bulkTransactionId === idOrBulkId);
        const allProcessTxs = filteredTransactions.filter(tx => tx.processId === idOrBulkId);
        const allTransferTxs = filteredTransactions.filter(tx => tx.transferId === idOrBulkId);
        const allSalesTxs = filteredTransactions.filter(tx => tx.salesId === idOrBulkId);
        
        if (allBulkTxs.length > 0) {
          setDeleteConfirmId({
            id: allBulkTxs[0].id,
            isBulkGroup: true,
            bulkTransactionId: idOrBulkId,
            itemCount: allBulkTxs.length,
            type: 'bulk'
          });
        } else if (allProcessTxs.length > 0) {
          setDeleteConfirmId({
            id: allProcessTxs[0].id,
            isBulkGroup: true,
            processId: idOrBulkId,
            itemCount: allProcessTxs.length,
            type: 'process'
          });
        } else if (allTransferTxs.length > 0) {
          setDeleteConfirmId({
            id: allTransferTxs[0].id,
            isBulkGroup: true,
            transferId: idOrBulkId,
            itemCount: allTransferTxs.length,
            type: 'transfer'
          });
        } else if (allSalesTxs.length > 0) {
          setDeleteConfirmId({
            id: allSalesTxs[0].id,
            isBulkGroup: true,
            salesId: idOrBulkId,
            itemCount: allSalesTxs.length,
            type: 'sales'
          });
        }
      } else {
        // This is a transaction ID, check if it's part of a bulk, process, transfer, or sales group
        const txById = filteredTransactions.find(tx => tx.id === idOrBulkId);
        
        if (txById?.bulkTransactionId) {
          // This is part of a bulk transaction group
          const allBulkTxs = filteredTransactions.filter(tx => tx.bulkTransactionId === txById.bulkTransactionId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            bulkTransactionId: txById.bulkTransactionId,
            itemCount: allBulkTxs.length,
            type: 'bulk'
          });
        } else if (txById?.processId) {
          // This is part of a process group
          const allProcessTxs = filteredTransactions.filter(tx => tx.processId === txById.processId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            processId: txById.processId,
            itemCount: allProcessTxs.length,
            type: 'process'
          });
        } else if (txById?.transferId) {
          // This is part of a transfer group
          const allTransferTxs = filteredTransactions.filter(tx => tx.transferId === txById.transferId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            transferId: txById.transferId,
            itemCount: allTransferTxs.length,
            type: 'transfer'
          });
        } else if (txById?.salesId) {
          // This is part of a sales group
          const allSalesTxs = filteredTransactions.filter(tx => tx.salesId === txById.salesId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            salesId: txById.salesId,
            itemCount: allSalesTxs.length,
            type: 'sales'
          });
        } else {
          // Single transaction
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: false,
            bulkTransactionId: null,
            itemCount: 1,
            type: 'single'
          });
        }
      }
    } catch (error) {
      console.error("Error in delete setup:", error);
    }
  };

  const executeDelete = async (deleteOption: 'delete' | 'reverse') => {
    if (!deleteConfirmId) return;

    try {
      if (deleteConfirmId.isBulkGroup) {
        // Get the appropriate transactions based on type
        let relevantTxs: any[] = [];
        
        if (deleteConfirmId.type === 'bulk') {
          relevantTxs = filteredTransactions.filter(tx => tx.bulkTransactionId === deleteConfirmId.bulkTransactionId);
        } else if (deleteConfirmId.type === 'process') {
          relevantTxs = filteredTransactions.filter(tx => tx.processId === deleteConfirmId.processId);
        } else if (deleteConfirmId.type === 'transfer') {
          relevantTxs = filteredTransactions.filter(tx => tx.transferId === deleteConfirmId.transferId);
        } else if (deleteConfirmId.type === 'sales') {
          relevantTxs = filteredTransactions.filter(tx => tx.salesId === deleteConfirmId.salesId);
        }
        
        if (deleteOption === 'reverse' && deleteConfirmId.type === 'process' && deleteConfirmId.processId) {
          const reversedCount = await reverseHeatTreatmentProcess(deleteConfirmId.processId);
          toast({
            title: "Success",
            description: `Reversed process with ${reversedCount} items`,
          });
          setDeleteConfirmId(null);
          return;
        }

        if (deleteOption === 'reverse' && (deleteConfirmId.type === 'bulk' || deleteConfirmId.type === 'process' || deleteConfirmId.type === 'transfer' || deleteConfirmId.type === 'sales')) {
          // Find all items and restore their previous balances
          const updatePromises = relevantTxs.map(tx => {
            // Get the item ID from itemId field
            const itemName = tx.itemId;
            // Find the item in stock-items collection by name
            return getDocs(
              query(collection(db, "stock-items"), where("name", "==", itemName))
            ).then(snapshot => {
              if (!snapshot.empty) {
                const itemId = snapshot.docs[0].id;
                
                // Prepare the update object based on transaction type
                const updateObj: any = {
                  lastUpdated: Timestamp.now()
                };
                
                // If we have stored balance information, use it for precise restoration
                if (tx.previousHTBalance !== undefined && tx.previousFABalance !== undefined && tx.previousOFBalance !== undefined) {
                  updateObj.heatTreatmentBalance = tx.previousHTBalance;
                  updateObj.factoryBalance = tx.previousFABalance;
                  updateObj.officeBalance = tx.previousOFBalance;
                  updateObj.quantity = tx.previousHTBalance + tx.previousFABalance + tx.previousOFBalance;
                } else {
                  // Fallback for old transactions without balance metadata
                  // For backwards compatibility, restore total quantity from previousBalance
                  updateObj.quantity = tx.previousBalance;
                  
                  // Try to infer which balance field was affected based on transaction type
                  if (tx.type === 'sales') {
                    updateObj.officeBalance = tx.previousBalance;
                  } else if (tx.type === 'heat_treatment_created') {
                    updateObj.heatTreatmentBalance = tx.previousBalance;
                  } else if (tx.type === 'factory_transfer_created') {
                    updateObj.heatTreatmentBalance = tx.previousBalance;
                  } else if (tx.type === 'office_transfer_created') {
                    updateObj.factoryBalance = tx.previousBalance;
                  }
                }
                
                return updateDoc(doc(db, "stock-items", itemId), updateObj);
              }
            });
          });
          await Promise.all(updatePromises);
        }
        
        // Delete all transaction records
        const deletePromises = relevantTxs.map(tx => deleteDoc(doc(db, "transactions", tx.id)));
        await Promise.all(deletePromises);

        if (deleteOption === 'reverse') {
          if (deleteConfirmId.type === 'transfer') {
            toast({
              title: "Success",
              description: `Deleted ${relevantTxs.length} transfer record(s)`,
            });
          } else if (deleteConfirmId.type === 'sales') {
            toast({
              title: "Success",
              description: `Deleted ${relevantTxs.length} sale record(s)`,
            });
          } else {
            toast({
              title: "Success",
              description: `Reversed ${deleteConfirmId.type === 'bulk' ? 'bulk transaction' : 'process'} with ${relevantTxs.length} items`,
            });
          }
        } else {
          toast({
            title: "Success",
            description: `Deleted ${deleteConfirmId.type === 'bulk' ? 'bulk transaction' : deleteConfirmId.type === 'process' ? 'process' : deleteConfirmId.type === 'transfer' ? 'transfer' : 'sale'} log with ${relevantTxs.length} items`,
          });
        }
      } else {
        // Delete single transaction
        const tx = filteredTransactions.find(t => t.id === deleteConfirmId.id);
        
        if (deleteOption === 'reverse' && tx && tx.type !== 'factory_transfer_created' && tx.type !== 'office_transfer_created' && tx.type !== 'sales') {
          // Restore previous balance (for bulk and process transactions)
          const itemName = tx.itemId;
          const snapshot = await getDocs(
            query(collection(db, "stock-items"), where("name", "==", itemName))
          );
          if (!snapshot.empty) {
            const itemId = snapshot.docs[0].id;
            
            // Prepare the update object
            const updateObj: any = {
              lastUpdated: Timestamp.now()
            };
            
            // If we have stored balance information, use it
            if (tx.previousHTBalance !== undefined && tx.previousFABalance !== undefined && tx.previousOFBalance !== undefined) {
              updateObj.heatTreatmentBalance = tx.previousHTBalance;
              updateObj.factoryBalance = tx.previousFABalance;
              updateObj.officeBalance = tx.previousOFBalance;
              updateObj.quantity = tx.previousHTBalance + tx.previousFABalance + tx.previousOFBalance;
            } else {
              updateObj.quantity = tx.previousBalance;
            }
            
            await updateDoc(doc(db, "stock-items", itemId), updateObj);
          }
        } else if (deleteOption === 'reverse' && tx && (tx.type === 'sales' || tx.type === 'factory_transfer_created' || tx.type === 'office_transfer_created')) {
          // For sales, factory_transfer, and office_transfer, restore location-specific balances
          const itemName = tx.itemId;
          const snapshot = await getDocs(
            query(collection(db, "stock-items"), where("name", "==", itemName))
          );
          if (!snapshot.empty) {
            const itemId = snapshot.docs[0].id;
            
            // Prepare the update object based on transaction metadata
            const updateObj: any = {
              lastUpdated: Timestamp.now()
            };
            
            if (tx.previousHTBalance !== undefined && tx.previousFABalance !== undefined && tx.previousOFBalance !== undefined) {
              updateObj.heatTreatmentBalance = tx.previousHTBalance;
              updateObj.factoryBalance = tx.previousFABalance;
              updateObj.officeBalance = tx.previousOFBalance;
              updateObj.quantity = tx.previousHTBalance + tx.previousFABalance + tx.previousOFBalance;
            } else {
              // Fallback for old transactions
              if (tx.type === 'sales') {
                updateObj.officeBalance = tx.previousBalance;
              } else if (tx.type === 'factory_transfer_created') {
                updateObj.heatTreatmentBalance = tx.previousBalance;
              } else if (tx.type === 'office_transfer_created') {
                updateObj.factoryBalance = tx.previousBalance;
              }
              updateObj.quantity = tx.previousBalance;
            }
            
            await updateDoc(doc(db, "stock-items", itemId), updateObj);
          }
        }
        
        await deleteDoc(doc(db, "transactions", deleteConfirmId.id));
        
        if (deleteOption === 'reverse') {
          toast({
            title: "Success",
            description: "Transaction reversed successfully",
          });
        } else {
          toast({
            title: "Success",
            description: "Transaction log deleted successfully",
          });
        }
      }
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete transaction",
      });
    }
  };

  const sortItemsByName = (items: any[]) => {
    return [...items].sort((a, b) => {
      const nameA = a.itemId.toLowerCase();
      const nameB = b.itemId.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  };

  const groupBulkTransactions = (txs: any[]) => {
    const grouped: { [key: string]: any[] } = {};
    const processGrouped: { [key: string]: any[] } = {};
    const transferGrouped: { [key: string]: any[] } = {};
    const salesGrouped: { [key: string]: any[] } = {};
    const singles: any[] = [];

    // Sort by timestamp first (newest first)
    const sortedTxs = [...txs].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    sortedTxs.forEach(tx => {
      if (tx.bulkTransactionId) {
        if (!grouped[tx.bulkTransactionId]) {
          grouped[tx.bulkTransactionId] = [];
        }
        grouped[tx.bulkTransactionId].push(tx);
      } else if (tx.processId) {
        if (!processGrouped[tx.processId]) {
          processGrouped[tx.processId] = [];
        }
        processGrouped[tx.processId].push(tx);
      } else if (tx.transferId) {
        if (!transferGrouped[tx.transferId]) {
          transferGrouped[tx.transferId] = [];
        }
        transferGrouped[tx.transferId].push(tx);
      } else if (tx.salesId) {
        if (!salesGrouped[tx.salesId]) {
          salesGrouped[tx.salesId] = [];
        }
        salesGrouped[tx.salesId].push(tx);
      } else {
        singles.push(tx);
      }
    });

    const result: any[] = [];
    // Add bulk transactions first
    Object.entries(grouped).forEach(([bulkId, group]) => {
      result.push({ 
        type: 'bulk', 
        transactions: group, 
        id: bulkId,
        timestamp: group[0].timestamp 
      });
    });
    // Add process groups
    Object.entries(processGrouped).forEach(([processId, group]) => {
      result.push({ 
        type: 'process', 
        transactions: group, 
        id: processId,
        timestamp: group[0].timestamp 
      });
    });
    // Add transfer groups
    Object.entries(transferGrouped).forEach(([transferId, group]) => {
      const transferType = group[0].type === 'factory_transfer_created' ? 'factory_transfer' : 'office_transfer';
      result.push({ 
        type: 'transfer', 
        transferType: transferType,
        transactions: group, 
        id: transferId,
        timestamp: group[0].timestamp 
      });
    });
    // Add sales groups
    Object.entries(salesGrouped).forEach(([salesId, group]) => {
      result.push({ 
        type: 'sales', 
        transactions: group, 
        id: salesId,
        timestamp: group[0].timestamp,
        salesCompany: group[0].salesCompany
      });
    });
    // Then add singles
    singles.forEach(single => {
      result.push({ 
        type: 'single', 
        transaction: single, 
        id: single.id,
        timestamp: single.timestamp 
      });
    });

    // Sort final result by timestamp (newest first)
    return result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  };

  const handleDeleteHistoryByRange = async (range: 'lastMonth' | 'lastQuarter' | 'lastYear' | 'allTime') => {
    if (!confirm(`Are you sure you want to delete transactions from the last ${range === 'lastMonth' ? 'month' : range === 'lastQuarter' ? 'quarter' : range === 'lastYear' ? 'year' : 'all time'}? This cannot be undone.`)) {
      return;
    }

    try {
      const now = new Date();
      let cutoffDate = new Date();

      switch (range) {
        case 'lastMonth':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case 'lastQuarter':
          cutoffDate.setMonth(now.getMonth() - 3);
          break;
        case 'lastYear':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'allTime':
          cutoffDate = new Date(0);
          break;
      }

      const q = query(
        collection(db, "transactions"),
        where("timestamp", ">=", Timestamp.fromDate(cutoffDate))
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "transactions", d.id)));
      
      await Promise.all(deletePromises);

      toast({
        title: "Success",
        description: `Deleted ${snapshot.docs.length} transaction(s)`,
      });
    } catch (error) {
      console.error("Error deleting transactions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete transactions",
      });
    }
  };

  const formatExactTime = (date: Date) => {
    try {
      return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return new Date(date).toLocaleString();
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Stock History</h1>
            <p className="text-slate-500 mt-1">Audit log of all inventory movements.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none md:w-48">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSelectedDate("")}
                title={selectedDate ? "Clear date filter" : "Select date"}
              >
                <Calendar className="h-4 w-4 text-slate-400" />
              </Button>
              <Input
                type="date"
                placeholder="Filter by date..."
                className="pl-9 bg-white border-slate-200"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            
            {/* Filter Button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-10 border-slate-200"
                >
                  <Filter className="h-4 w-4" />
                  <span className="text-xs font-medium">Filter</span>
                  {selectedFilters.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 h-5 rounded-full text-xs">
                      {selectedFilters.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700">Filter By Type</h3>
                      {selectedFilters.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                          onClick={() => setSelectedFilters([])}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {/* Heat Treatment */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilters.includes('heat_treatment')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFilters([...selectedFilters, 'heat_treatment']);
                            } else {
                              setSelectedFilters(selectedFilters.filter(f => f !== 'heat_treatment'));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-slate-600">Heat Treatment</span>
                      </label>
                      
                      {/* Transfer to Factory */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilters.includes('transfer_factory')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFilters([...selectedFilters, 'transfer_factory']);
                            } else {
                              setSelectedFilters(selectedFilters.filter(f => f !== 'transfer_factory'));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-slate-600">Transfer to Factory</span>
                      </label>
                      
                      {/* Transfer to Office */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilters.includes('transfer_office')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFilters([...selectedFilters, 'transfer_office']);
                            } else {
                              setSelectedFilters(selectedFilters.filter(f => f !== 'transfer_office'));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-slate-600">Transfer to Office</span>
                      </label>
                      
                      {/* Sales */}
                      <div className="border-t border-slate-200 pt-2 mt-2">
                        <button
                          onClick={() => setExpandedSalesFilter(!expandedSalesFilter)}
                          className="flex items-center gap-2 w-full text-sm text-slate-600 hover:text-slate-700 font-medium"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFilters.some(f => f.startsWith('sales:'))}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span>Sales</span>
                          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${
                            expandedSalesFilter ? 'rotate-180' : ''
                          }`} />
                        </button>
                        
                        {/* Sales Company Options */}
                        {expandedSalesFilter && (
                          <div className="space-y-2 mt-2 ml-6">
                            {['CEC', 'AGW', 'BHP'].map((company) => (
                              <label key={company} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedFilters.includes(`sales:${company}`)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedFilters([...selectedFilters, `sales:${company}`]);
                                    } else {
                                      setSelectedFilters(selectedFilters.filter(f => f !== `sales:${company}`));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <span className="text-sm text-slate-600">{company}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleDeleteHistoryByRange('lastMonth')}>
                  Delete Last Month
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDeleteHistoryByRange('lastQuarter')}>
                  Delete Last Quarter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDeleteHistoryByRange('lastYear')}>
                  Delete Last Year
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDeleteHistoryByRange('allTime')}
                  className="text-red-600"
                >
                  Delete All History
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No transactions found
                </div>
              ) : (
                groupBulkTransactions(filteredTransactions).map((item) => {
                  if (item.type === 'bulk') {
                    const bulkTransactions = item.transactions;
                    const isExpanded = expandedBulkId === item.id;
                    const firstTx = bulkTransactions[0];

                    return (
                      <div key={item.id} className="border-b border-slate-100 last:border-b-0">
                        {/* Bulk Transaction Header */}
                        <div 
                          className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-3"
                          onClick={() => setExpandedBulkId(isExpanded ? null : item.id)}
                        >
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <Badge className="bg-indigo-100 text-indigo-700 text-xs">BULK</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              Bulk Transaction ({bulkTransactions.length} items)
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTransaction(item.id, true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Bulk Transaction Items */}
                        {isExpanded && (
                          <div className="bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-100">
                            {sortItemsByName(bulkTransactions).map((entry) => {
                              const isIncrease = entry.quantityChange > 0;
                              const location = entry.locationId ? locations.find(l => l.id === entry.locationId) : null;
                              return (
                                <div key={entry.id} className="p-3 flex items-center justify-between gap-4 pl-12">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`
                                      h-8 w-8 rounded-full flex items-center justify-center border flex-shrink-0 text-xs
                                      ${isIncrease
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                        : 'bg-amber-50 border-amber-100 text-amber-600'}
                                    `}>
                                      {isIncrease ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 truncate">
                                        {capitalize(entry.itemId)}
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap mt-1">
                                        <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                                          {capitalize(entry.category)}
                                        </Badge>
                                        {location && (
                                          <Badge variant="secondary" className="text-xs font-normal bg-blue-50 text-blue-700">
                                            {capitalize(location.name)}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-600">Before: <span className="font-semibold">{entry.previousBalance}</span></span>
                                        <span className="text-xs text-slate-600">After: <span className="font-semibold">{entry.balance}</span></span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className={`text-sm font-bold flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {isIncrease ? '+' : ''}{entry.quantityChange}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleDeleteTransaction(entry.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  } else if (item.type === 'process') {
                    const processTransactions = item.transactions;
                    const isExpanded = expandedBulkId === item.id;
                    const firstTx = processTransactions[0];

                    // Determine process type from first transaction
                    const processType = firstTx.type === 'heat_treatment_created' 
                      ? 'HEAT TREATMENT'
                      : firstTx.type === 'factory_transfer_created'
                      ? 'FACTORY TRANSFER'
                      : 'OFFICE TRANSFER';

                    const badgeColor = firstTx.type === 'heat_treatment_created'
                      ? 'bg-orange-100 text-orange-700'
                      : firstTx.type === 'factory_transfer_created'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700';

                    return (
                      <div key={item.id} className="border-b border-slate-100 last:border-b-0">
                        {/* Process Group Header */}
                        <div 
                          className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-3"
                          onClick={() => setExpandedBulkId(isExpanded ? null : item.id)}
                        >
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <Badge className={`${badgeColor} text-xs`}>{processType}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {processType} Process ({processTransactions.length} items)
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTransaction(item.id, true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Process Group Items */}
                        {isExpanded && (
                          <div className="bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-100">
                            {sortItemsByName(processTransactions).map((entry) => {
                              const isIncrease = entry.quantityChange > 0;
                              const location = entry.locationId ? locations.find(l => l.id === entry.locationId) : null;
                              return (
                                <div key={entry.id} className="p-3 flex items-center justify-between gap-4 pl-12">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`
                                      h-8 w-8 rounded-full flex items-center justify-center border flex-shrink-0 text-xs
                                      ${isIncrease
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                        : 'bg-amber-50 border-amber-100 text-amber-600'}
                                    `}>
                                      {isIncrease ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 truncate">
                                        {capitalize(entry.itemId)}
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap mt-1">
                                        <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                                          {capitalize(entry.category)}
                                        </Badge>
                                        {location && (
                                          <Badge variant="secondary" className="text-xs font-normal bg-blue-50 text-blue-700">
                                            {capitalize(location.name)}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-600">Before: <span className="font-semibold">{entry.previousBalance}</span></span>
                                        <span className="text-xs text-slate-600">After: <span className="font-semibold">{entry.balance}</span></span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className={`text-sm font-bold flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {isIncrease ? '+' : ''}{entry.quantityChange}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleDeleteTransaction(entry.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  } else if (item.type === 'transfer') {
                    const transferTransactions = item.transactions;
                    const isExpanded = expandedBulkId === item.id;
                    const firstTx = transferTransactions[0];

                    // Determine transfer type
                    const transferType = item.transferType === 'factory_transfer' 
                      ? 'FACTORY TRANSFER'
                      : 'OFFICE TRANSFER';

                    const badgeColor = item.transferType === 'factory_transfer'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-green-100 text-green-700';

                    return (
                      <div key={item.id} className="border-b border-slate-100 last:border-b-0">
                        {/* Transfer Group Header */}
                        <div 
                          className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-3"
                          onClick={() => setExpandedBulkId(isExpanded ? null : item.id)}
                        >
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <Badge className={`${badgeColor} text-xs`}>{transferType}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {transferType} ({transferTransactions.length} items)
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTransaction(item.id, true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Transfer Group Items */}
                        {isExpanded && (
                          <div className="bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-100">
                            {sortItemsByName(transferTransactions).map((entry) => {
                              const isIncrease = entry.quantityChange > 0;
                              return (
                                <div key={entry.id} className="p-3 flex items-center justify-between gap-4 pl-12">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`
                                      h-8 w-8 rounded-full flex items-center justify-center border flex-shrink-0 text-xs
                                      ${isIncrease
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                        : 'bg-amber-50 border-amber-100 text-amber-600'}
                                    `}>
                                      {isIncrease ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 truncate">
                                        {capitalize(entry.itemId)}
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap mt-1">
                                        <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                                          {capitalize(entry.category)}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-600">Before: <span className="font-semibold">{entry.previousBalance}</span></span>
                                        <span className="text-xs text-slate-600">After: <span className="font-semibold">{entry.balance}</span></span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className={`text-sm font-bold flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {isIncrease ? '+' : ''}{entry.quantityChange}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleDeleteTransaction(entry.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  } else if (item.type === 'sales') {
                    const salesTransactions = item.transactions;
                    const isExpanded = expandedBulkId === item.id;
                    const firstTx = salesTransactions[0];

                    return (
                      <div key={item.id} className="border-b border-slate-100 last:border-b-0">
                        {/* Sales Group Header */}
                        <div 
                          className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-3"
                          onClick={() => setExpandedBulkId(isExpanded ? null : item.id)}
                        >
                          <div className="flex-shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-slate-400" />
                            )}
                          </div>
                          <Badge className="bg-orange-100 text-orange-700 text-xs">SALES - {item.salesCompany}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              Sold by {item.salesCompany} ({salesTransactions.length} items)
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTransaction(item.id, true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Sales Group Items */}
                        {isExpanded && (
                          <div className="bg-slate-50/50 divide-y divide-slate-100 border-t border-slate-100">
                            {sortItemsByName(salesTransactions).map((entry) => {
                              const isIncrease = entry.quantityChange > 0;
                              return (
                                <div key={entry.id} className="p-3 flex items-center justify-between gap-4 pl-12">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`
                                      h-8 w-8 rounded-full flex items-center justify-center border flex-shrink-0 text-xs
                                      ${isIncrease
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                        : 'bg-amber-50 border-amber-100 text-amber-600'}
                                    `}>
                                      {isIncrease ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 truncate">
                                        {capitalize(entry.itemId)}
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap mt-1">
                                        <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                                          {capitalize(entry.category)}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-slate-600">Office Before: <span className="font-semibold">{entry.previousBalance}</span></span>
                                        <span className="text-xs text-slate-600">After: <span className="font-semibold">{entry.balance}</span></span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className={`text-sm font-bold flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {isIncrease ? '+' : ''}{entry.quantityChange}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleDeleteTransaction(entry.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    const entry = item.transaction;
                    const isIncrease = entry.quantityChange > 0;
                    const location = entry.locationId ? locations.find(l => l.id === entry.locationId) : null;
                    return (
                      <div key={entry.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`
                            h-9 w-9 rounded-full flex items-center justify-center border flex-shrink-0
                            ${isIncrease
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                              : 'bg-amber-50 border-amber-100 text-amber-600'}
                          `}>
                            {isIncrease ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {capitalize(entry.itemId)}
                              </p>
                              {entry.type === 'creation' && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">NEW</Badge>
                              )}
                              {entry.type === 'transfer' && (
                                <Badge className="bg-purple-100 text-purple-700 text-xs">TRANSFER</Badge>
                              )}
                              {entry.type === 'heat_treatment_created' && (
                                <Badge className="bg-orange-100 text-orange-700 text-xs">HEAT TREATMENT</Badge>
                              )}
                              {entry.type === 'factory_transfer_created' && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">FACTORY TRANSFER</Badge>
                              )}
                              {entry.type === 'office_transfer_created' && (
                                <Badge className="bg-green-100 text-green-700 text-xs">OFFICE TRANSFER</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-600">
                                {capitalize(entry.category)}
                              </Badge>
                              {location && (
                                <Badge variant="secondary" className="text-xs font-normal bg-blue-50 text-blue-700">
                                  {capitalize(location.name)}
                                </Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{entry.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(entry.timestamp)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {entry.type === 'creation' ? (
                                <span className="text-xs text-slate-600">Initial Stock: <span className="font-semibold text-blue-600">{entry.balance}</span></span>
                              ) : (
                                <>
                                  <span className="text-xs text-slate-600">Before: <span className="font-semibold">{entry.previousBalance}</span></span>
                                  <span className="text-xs text-slate-600">After: <span className="font-semibold">{entry.balance}</span></span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-sm font-black flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                            {isIncrease ? '+' : ''}{entry.quantityChange}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteTransaction(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  }
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Delete Transaction</DialogTitle>
              <DialogDescription>
                {deleteConfirmId?.isBulkGroup 
                  ? `This will affect ${deleteConfirmId?.itemCount} items in the bulk transaction.`
                  : "What would you like to do with this transaction?"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-600">
                <strong>Choose an action:</strong>
              </p>
              <div className="space-y-2">
                {canReverseDelete && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-3 px-4"
                    onClick={() => executeDelete('reverse')}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-900">Reverse Changes</span>
                      <span className="text-xs text-slate-600">Undo the stock adjustment and restore previous quantity</span>
                    </div>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3 px-4"
                  onClick={() => executeDelete('delete')}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-900">Delete Log Only</span>
                    <span className="text-xs text-slate-600">Remove from history but keep stock quantities as they are</span>
                  </div>
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
