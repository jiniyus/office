import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, Search, Trash2, Calendar, ChevronDown, ChevronRight, Filter, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTransactions, useLocations, useStockItems } from "@/lib/firestore-hooks";
import { useState, useMemo, useEffect, type FocusEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import { format } from "date-fns";
import { capitalize, naturalCompare } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createAdjustmentTransaction, reverseAdvancedGroup, saveAdvancedGroupEdit, findMirrorFollowUps, recalculateAdvancedStateOptimized } from "@/lib/advanced-history";

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

interface EditHistoryRow {
  id: string;
  quantity: string;
}

interface EditHistoryState {
  type: "process" | "factory_transfer" | "office_transfer" | "sales";
  groupId: string;
  title: string;
  rows: EditHistoryRow[];
  businessDate: string;
  salesCompany: "CEC" | "AGW" | "BRP" | "";
  remarks: string;
  processSerialNumber: string;
  editFollowups?: boolean;
}

export default function HistoryPage() {
  const HISTORY_ACTION_PASSWORD = "2026";
  const [groupDisplayLimit, setGroupDisplayLimit] = useState(100);
  const [rawTransactionLimit, setRawTransactionLimit] = useState(500);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const loadAllTransactions = selectedDate !== "" || selectedFilters.length > 0;
  const { transactions, loading, hasMore } = useTransactions(rawTransactionLimit, loadAllTransactions);
  const { locations } = useLocations();
  const { items } = useStockItems();
  const { user } = useAuth();
  const [expandedBulkId, setExpandedBulkId] = useState<string | null>(null);
  const [expandedSingleHistoryId, setExpandedSingleHistoryId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<any>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [editState, setEditState] = useState<EditHistoryState | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [expandedSalesFilter, setExpandedSalesFilter] = useState(false);
  const [nonMatchingMirrorsDialog, setNonMatchingMirrorsDialog] = useState<{ show: boolean; proceed: (() => void) | null } | null>(null);
  const [noFollowUpsDialog, setNoFollowUpsDialog] = useState<boolean>(false);
  const [deleteHistoryRange, setDeleteHistoryRange] = useState<'lastMonth' | 'lastQuarter' | 'lastYear' | 'allTime' | null>(null);
  const [deleteHistoryPassword, setDeleteHistoryPassword] = useState("");
  const { toast } = useToast();

  const normalizeItemKeyPart = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLowerCase();

  const getItemKey = (itemName: string, category: string) =>
    `${normalizeItemKeyPart(itemName)}::${normalizeItemKeyPart(category)}`;

  const getDuplicateEditRowMessage = (rows: EditHistoryRow[]) => {
    const firstRowByItemId = new Map<string, number>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.id) continue;

      const firstRow = firstRowByItemId.get(row.id);
      if (firstRow !== undefined) {
        const item = items.find((stockItem) => stockItem.id === row.id);
        const label = item ? `${capitalize(item.name)} - ${capitalize(item.category)}` : row.id;
        return `${label} is selected in rows ${firstRow + 1} and ${index + 1}. Each item can only appear once.`;
      }

      firstRowByItemId.set(row.id, index);
    }

    return null;
  };

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  const toDateInputValue = (date?: Date) => {
    if (!date) return new Date().toISOString().split("T")[0];
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatBusinessDate = (date?: Date) => {
    if (!date) return null;
    return format(date, "MMM dd, yyyy");
  };

  const getStockItemIdFromTransaction = (itemName: string, category: string) =>
    items.find((item) => getItemKey(item.name, item.category) === getItemKey(itemName, category))?.id || "";

  const findStockItemDocId = async (itemName: string, category: string) => {
    const snapshot = await getDocs(
      query(
        collection(db, "stock-items"),
        where("name", "==", itemName),
        where("category", "==", category)
      )
    );

    if (!snapshot.empty) return snapshot.docs[0].id;

    return (
      items.find((item) => getItemKey(item.name, item.category) === getItemKey(itemName, category))?.id ||
      null
    );
  };

  const mapTransactionDoc = (docSnap: any) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      category: data.category,
      company: data.company,
      itemId: data.itemId,
      notes: data.notes,
      businessDate: data.businessDate?.toDate?.() || undefined,
      edited: data.edited || false,
      editedAt: data.editedAt?.toDate?.() || undefined,
      processSerialNumber: data.processSerialNumber,
      quantityChange: data.quantityChange || 0,
      previousBalance: data.previousBalance || 0,
      balance: data.balance || 0,
      locationId: data.locationId,
      timestamp: data.timestamp?.toDate?.() || new Date(),
      type: data.type || "adjustment",
      bulkTransactionId: data.bulkTransactionId,
      processId: data.processId,
      transferId: data.transferId,
      salesId: data.salesId,
      salesCompany: data.salesCompany,
      affectedBalance: data.affectedBalance,
      previousHTBalance: data.previousHTBalance,
      previousFABalance: data.previousFABalance,
      previousOFBalance: data.previousOFBalance,
      newHTBalance: data.newHTBalance,
      newFABalance: data.newFABalance,
      newOFBalance: data.newOFBalance,
      historyDeleteOnly: data.historyDeleteOnly || false,
      historyHidden: data.historyHidden || false,
      manualStockEdit: data.manualStockEdit || false,
      user: data.user || { id: "", name: "Unknown" },
    };
  };

  const fetchGroupTransactions = async (
    type: EditHistoryState["type"] | "bulk",
    groupId: string
  ) => {
    const constraints: any[] = [];

    if (type === "bulk") {
      constraints.push(where("bulkTransactionId", "==", groupId));
    } else if (type === "process") {
      constraints.push(where("processId", "==", groupId));
    } else if (type === "sales") {
      constraints.push(where("salesId", "==", groupId));
    } else {
      constraints.push(where("transferId", "==", groupId));
    }

    const expectedTransferType =
      type === "factory_transfer"
        ? "factory_transfer_created"
        : type === "office_transfer"
        ? "office_transfer_created"
        : null;

    const snapshot = await getDocs(query(collection(db, "transactions"), ...constraints));
    return snapshot.docs
      .map(mapTransactionDoc)
      .filter((tx) => !user?.company || tx.company === user.company)
      .filter((tx) => !expectedTransferType || tx.type === expectedTransferType)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const openEditDialog = async (
    type: EditHistoryState["type"],
    groupId: string,
    txs: any[],
    options?: { title?: string; processSerialNumber?: string }
  ) => {
    try {
      const groupTxs = groupId ? await fetchGroupTransactions(type, groupId) : txs;
      const editTxs = groupTxs.length > 0 ? groupTxs : txs;
      const firstTx = editTxs[0];
      if (!firstTx) return;

      setEditState({
        type,
        groupId,
        title: options?.title || "Edit Entry",
        rows: editTxs.map((tx) => ({
          id: getStockItemIdFromTransaction(tx.itemId, tx.category),
          quantity: `${Math.abs(tx.quantityChange || 0)}`,
        })),
        businessDate: toDateInputValue(firstTx.businessDate || firstTx.timestamp),
        salesCompany: (firstTx.salesCompany || "") as "CEC" | "AGW" | "BRP" | "",
        remarks: firstTx.notes || "",
        processSerialNumber: options?.processSerialNumber || firstTx.processSerialNumber || "",
      });
      setEditPassword("");
    } catch (error) {
      console.error("Error loading history entry for edit:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load the complete history entry for editing.",
      });
    }
  };

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

      const previousHTBalance = stockItem.heatTreatmentBalance;
      const previousFABalance = stockItem.factoryBalance;
      const previousOFBalance = stockItem.officeBalance;
      const previousTotal = previousHTBalance + previousFABalance + previousOFBalance;
      const nextTotal = nextHTBalance + nextFABalance + nextOFBalance;

      await updateDoc(doc(db, "stock-items", stockItem.id), {
        heatTreatmentBalance: nextHTBalance,
        factoryBalance: nextFABalance,
        officeBalance: nextOFBalance,
        quantity: nextTotal,
        lastUpdated: Timestamp.now(),
      });

      await createAdjustmentTransaction({
        company: user?.company || "",
        itemId: stockItem.name,
        category: stockItem.category,
        user: {
          id: user?.uid || "",
          name: user?.displayName || "Unknown",
        },
        quantityChange: nextTotal - previousTotal,
        previousBalance: previousTotal,
        balance: nextTotal,
        previousHTBalance,
        previousFABalance,
        previousOFBalance,
        newHTBalance: nextHTBalance,
        newFABalance: nextFABalance,
        newOFBalance: nextOFBalance,
        affectedBalance: "heatTreatmentBalance",
        locationId: null,
        businessDate: processSnapshot.exists()
          ? (processSnapshot.data()?.businessDate ?? Timestamp.now())
          : Timestamp.now(),
        timestamp: Timestamp.now(),
        notes: `Reversal adjustment preserving history for heat treatment process ${processId}.`,
        processId,
      });
    }

    if (processSnapshot.exists()) {
      await deleteDoc(doc(db, "processes", processId));
    }

    return processTransactions.length;
  };

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((tx) => !tx.historyHidden);
    
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

  const groupedHistoryItems = useMemo(
    () => groupBulkTransactions(filteredTransactions),
    [filteredTransactions]
  );
  const visibleGroupedHistoryItems = useMemo(
    () => (loadAllTransactions ? groupedHistoryItems : groupedHistoryItems.slice(0, groupDisplayLimit)),
    [groupDisplayLimit, groupedHistoryItems, loadAllTransactions]
  );

  useEffect(() => {
    if (loadAllTransactions) return;
    if (!hasMore) return;
    if (groupedHistoryItems.length >= groupDisplayLimit) return;

    setRawTransactionLimit((current) => current + 500);
  }, [groupDisplayLimit, groupedHistoryItems.length, hasMore, loadAllTransactions]);

  const canReverseDelete = deleteConfirmId
    ? deleteConfirmId.isBulkGroup
      ? deleteConfirmId.type !== "transfer"
      : (() => {
          const tx = filteredTransactions.find(t => t.id === deleteConfirmId.id);
          return tx
            ? !tx.historyDeleteOnly &&
              tx.type !== "factory_transfer_created" &&
              tx.type !== "office_transfer_created"
            : true;
        })()
    : false;

  const createAdjustmentForTx = async (tx: any, updateObj: any) => {
    const itemId = await findStockItemDocId(tx.itemId, tx.category);
    if (!itemId) return;

    const stockItem = items.find((item) => item.id === itemId);
    if (!stockItem) return;

    const previousHT = stockItem.heatTreatmentBalance || 0;
    const previousFA = stockItem.factoryBalance || 0;
    const previousOF = stockItem.officeBalance || 0;
    const nextHT = updateObj.heatTreatmentBalance ?? previousHT;
    const nextFA = updateObj.factoryBalance ?? previousFA;
    const nextOF = updateObj.officeBalance ?? previousOF;
    const previousBalance = previousHT + previousFA + previousOF;
    const balance = nextHT + nextFA + nextOF;

    await createAdjustmentTransaction({
      company: user?.company || "",
      itemId: tx.itemId,
      category: tx.category,
      user: {
        id: user?.uid || "",
        name: user?.displayName || "Unknown",
      },
      quantityChange: balance - previousBalance,
      previousBalance,
      balance,
      previousHTBalance: previousHT,
      previousFABalance: previousFA,
      previousOFBalance: previousOF,
      newHTBalance: nextHT,
      newFABalance: nextFA,
      newOFBalance: nextOF,
      affectedBalance:
        tx.type === "sales"
          ? "officeBalance"
          : tx.type === "factory_transfer_created"
          ? "factoryBalance"
          : tx.type === "office_transfer_created"
          ? "officeBalance"
          : "heatTreatmentBalance",
      locationId: tx.locationId ?? null,
      businessDate: tx.businessDate,
      timestamp: Timestamp.now(),
      notes: `Reversal adjustment preserving history for transaction ${tx.id}.`,
      processId: tx.processId,
      transferId: tx.transferId,
      salesId: tx.salesId,
    });
  };

  const handleDeleteTransaction = async (idOrBulkId: string, isBulkId: boolean = false) => {
    try {
      if (isBulkId) {
        // Check if this is a bulkTransactionId, processId, transferId, or salesId
        const [allBulkTxs, allProcessTxs, allFactoryTransferTxs, allOfficeTransferTxs, allSalesTxs] =
          await Promise.all([
            fetchGroupTransactions("bulk", idOrBulkId),
            fetchGroupTransactions("process", idOrBulkId),
            fetchGroupTransactions("factory_transfer", idOrBulkId),
            fetchGroupTransactions("office_transfer", idOrBulkId),
            fetchGroupTransactions("sales", idOrBulkId),
          ]);
        const allTransferTxs =
          allFactoryTransferTxs.length > 0 ? allFactoryTransferTxs : allOfficeTransferTxs;
        const transferType =
          allFactoryTransferTxs.length > 0 ? "factory_transfer" : "office_transfer";
        
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
            type: 'transfer',
            transferType
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
          const allBulkTxs = await fetchGroupTransactions("bulk", txById.bulkTransactionId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            bulkTransactionId: txById.bulkTransactionId,
            itemCount: allBulkTxs.length,
            type: 'bulk'
          });
        } else if (txById?.processId) {
          // This is part of a process group
          const allProcessTxs = await fetchGroupTransactions("process", txById.processId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            processId: txById.processId,
            itemCount: allProcessTxs.length,
            type: 'process'
          });
        } else if (txById?.transferId) {
          // This is part of a transfer group
          const transferType =
            txById.type === "factory_transfer_created" ? "factory_transfer" : "office_transfer";
          const allTransferTxs = await fetchGroupTransactions(transferType, txById.transferId);
          
          setDeleteConfirmId({
            id: idOrBulkId,
            isBulkGroup: true,
            transferId: txById.transferId,
            itemCount: allTransferTxs.length,
            type: 'transfer',
            transferType
          });
        } else if (txById?.salesId) {
          // This is part of a sales group
          const allSalesTxs = await fetchGroupTransactions("sales", txById.salesId);
          
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

  const validateHistoryPassword = (password: string) => {
    if (password !== HISTORY_ACTION_PASSWORD) {
      toast({
        variant: "destructive",
        title: "Incorrect password",
        description: "Enter the 4-digit password to delete or reverse history.",
      });
      return false;
    }

    return true;
  };

  const handleEditConfirm = async () => {
    if (!editState) return;
    if (!validateHistoryPassword(editPassword)) return;

    const validRows = editState.rows.filter((row) => row.id && parseInt(row.quantity, 10) > 0);
    const hasIncompleteRows = validRows.length !== editState.rows.length;

    if (hasIncompleteRows) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Every edit row needs an item and quantity. Remove unwanted rows before saving.",
      });
      return;
    }

    const duplicateMessage = getDuplicateEditRowMessage(validRows);
    if (duplicateMessage) {
      toast({
        variant: "destructive",
        title: "Error",
        description: duplicateMessage,
      });
      return;
    }

    try {
      setIsEditSubmitting(true);

      // Check for follow-up transactions if editing heat treatment and editFollowups is enabled
      if (editState.type === "process" && editState.editFollowups) {
        const mirrors = await findMirrorFollowUps(editState.groupId, user?.company);

        if (mirrors.length === 0) {
          // Bug fix: No follow-ups found, show dialog asking user to disable toggle
          setNoFollowUpsDialog(true);
          setIsEditSubmitting(false);
          return;
        }

        const allValid = mirrors.every((m) => m.isValid);

        if (!allValid) {
          // Show dialog for non-matching mirrors
          const handleProceedOnlyThis = async () => {
            setNonMatchingMirrorsDialog(null);
            await performEdit(validRows, true); // Only this one, skip recalc optimization
          };

          setNonMatchingMirrorsDialog({
            show: true,
            proceed: handleProceedOnlyThis,
          });
          setIsEditSubmitting(false);
          return;
        }

        // All mirrors are valid, proceed with follow-up editing
        await performEdit(validRows, false); // Edit with follow-ups
      } else {
        // Not heat treatment or editFollowups not enabled, regular edit
        await performEdit(validRows, true);
      }

      toast({
        title: "Success",
        description: "History entry updated successfully",
      });
      setEditState(null);
      setEditPassword("");
    } catch (error) {
      console.error("Error editing history entry:", error);
      const description = error instanceof Error ? error.message : "Failed to update history entry";
      toast({
        variant: "destructive",
        title: "Error",
        description,
      });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const performEdit = async (
    validRows: EditHistoryRow[],
    skipFollowUpRecalc: boolean
  ) => {
    if (!editState) return;

    const newQtys = new Map(
      validRows.map((row) => {
        const item = items.find((i) => i.id === row.id);
        return [item ? getItemKey(item.name, item.category) : "", parseInt(row.quantity, 10)];
      })
    );

    // Use the full stored group, not the currently visible history subset.
    const currentTxs = await fetchGroupTransactions(editState.type, editState.groupId);

    const currentQtys = new Map<string, number>();
    for (const tx of currentTxs) {
      const key = getItemKey(tx.itemId, tx.category);
      const current = currentQtys.get(key) || 0;
      currentQtys.set(key, current + Math.abs(tx.quantityChange || 0));
    }

    // Calculate changes for each item
    const changedItems = new Map<string, { oldQty: number; newQty: number; change: number }>();
    for (const [key, newQty] of Array.from(newQtys.entries())) {
      const oldQty = currentQtys.get(key) || 0;
      if (oldQty !== newQty) {
        changedItems.set(key, {
          oldQty,
          newQty,
          change: newQty - oldQty,
        });
      }
    }

    // Perform main edit - pass the base timestamp so HT gets oldest timestamp
    const baseTimestamp = Timestamp.now();
    
    // If editFollowups is enabled, update with follow-ups first
    if (editState.type === "process" && editState.editFollowups && changedItems.size > 0) {
      const mirrors = await findMirrorFollowUps(editState.groupId, user?.company);
      const validMirrors = mirrors.filter((m) => m.isValid);

      if (validMirrors.length > 0) {
        // Update follow-up transactions with staggered timestamps
        // HT (oldest via baseTimestamp-3) -> FA (offset+1) -> OF (offset+2, newest)
        const updatePromises: Promise<void>[] = [];

        for (const mirror of validMirrors) {
          const offset = mirror.transferType === "factory_transfer" ? 1 : 2;
          const txTimestamp = new Timestamp(
            baseTimestamp.seconds,
            baseTimestamp.nanoseconds + offset
          );
          
          for (const tx of mirror.transactions) {
            const key = getItemKey(tx.itemId, tx.category);
            const change = changedItems.get(key)?.change || 0;

            if (change !== 0) {
              const newQty = Math.max(0, (tx.quantityChange || 0) + change);
              if (newQty > 0) {
                updatePromises.push(
                  updateDoc(doc(db, "transactions", tx.id), {
                    timestamp: txTimestamp,
                    quantityChange: newQty,
                    edited: true,
                    editedAt: baseTimestamp,
                  })
                );
              } else {
                updatePromises.push(deleteDoc(doc(db, "transactions", tx.id)));
              }
            }
          }
        }

        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }
      }
    }
    
    await saveAdvancedGroupEdit({
      company: user?.company,
      type: editState.type,
      groupId: editState.groupId,
      rows: validRows.map((row) => ({
        stockItemId: row.id,
        quantity: parseInt(row.quantity, 10),
      })),
      businessDate: new Date(editState.businessDate),
      salesCompany: editState.type === "sales" ? editState.salesCompany : undefined,
      notes: editState.type === "sales" ? editState.remarks.trim() : undefined,
      processSerialNumber: editState.type === "process" ? editState.processSerialNumber.trim() : undefined,
      user: { id: user?.uid || "", name: user?.displayName || "Unknown" },
      editFollowups: editState.editFollowups,
      baseTimestamp,
    });
  };

  const executeDelete = async (deleteOption: 'delete' | 'reverse') => {
    if (!deleteConfirmId) return;
    if (!validateHistoryPassword(deletePassword)) return;

    try {
      if (deleteConfirmId.isBulkGroup) {
        // Get the appropriate transactions based on type
        let relevantTxs: any[] = [];
        
        if (deleteConfirmId.type === 'bulk') {
          relevantTxs = await fetchGroupTransactions("bulk", deleteConfirmId.bulkTransactionId);
        } else if (deleteConfirmId.type === 'process') {
          relevantTxs = await fetchGroupTransactions("process", deleteConfirmId.processId);
        } else if (deleteConfirmId.type === 'transfer') {
          relevantTxs = await fetchGroupTransactions(
            deleteConfirmId.transferType || "factory_transfer",
            deleteConfirmId.transferId
          );
        } else if (deleteConfirmId.type === 'sales') {
          relevantTxs = await fetchGroupTransactions("sales", deleteConfirmId.salesId);
        }
        
        if (deleteOption === 'reverse' && deleteConfirmId.type === 'process' && deleteConfirmId.processId) {
          const processId = deleteConfirmId.processId;
          setDeleteConfirmId(null);
          setDeletePassword("");
          await reverseAdvancedGroup('process', processId, user?.company);
          toast({
            title: "Success",
            description: `Reversed process with ${relevantTxs.length} items`,
          });
          return;
        }

        if (deleteOption === 'reverse' && deleteConfirmId.type === 'sales' && deleteConfirmId.salesId) {
          const salesId = deleteConfirmId.salesId;
          setDeleteConfirmId(null);
          setDeletePassword("");
          await reverseAdvancedGroup('sales', salesId, user?.company);
          toast({
            title: "Success",
            description: `Reversed sale with ${relevantTxs.length} items`,
          });
          return;
        }

        if (deleteOption === 'reverse' && deleteConfirmId.type === 'transfer' && deleteConfirmId.transferId) {
          const transferId = deleteConfirmId.transferId;
          const transferType =
            deleteConfirmId.transferType ||
            (relevantTxs[0]?.type === "office_transfer_created" ? "office_transfer" : "factory_transfer");
          setDeleteConfirmId(null);
          setDeletePassword("");
          await reverseAdvancedGroup(transferType, transferId, user?.company);
          toast({
            title: "Success",
            description: `Reversed transfer with ${relevantTxs.length} items`,
          });
          return;
        }

        if (deleteOption === 'reverse' && deleteConfirmId.type === 'bulk') {
          // Find all items and restore their previous balances
          const updatePromises = relevantTxs.map(async tx => {
            const itemId = await findStockItemDocId(tx.itemId, tx.category);
            if (!itemId) return null;

            const updateObj: any = {
              lastUpdated: Timestamp.now(),
            };

            if (tx.previousHTBalance !== undefined && tx.previousFABalance !== undefined && tx.previousOFBalance !== undefined) {
              updateObj.heatTreatmentBalance = tx.previousHTBalance;
              updateObj.factoryBalance = tx.previousFABalance;
              updateObj.officeBalance = tx.previousOFBalance;
              updateObj.quantity = tx.previousHTBalance + tx.previousFABalance + tx.previousOFBalance;
            } else {
              updateObj.quantity = tx.previousBalance;

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

            await updateDoc(doc(db, "stock-items", itemId), updateObj);
            return { tx, updateObj };
          });

          await Promise.all(updatePromises);
        }

        if (deleteOption === 'reverse') {
          await Promise.all(relevantTxs.map((tx) => deleteDoc(doc(db, "transactions", tx.id))));
        } else {
          await Promise.all(
            relevantTxs.map((tx) =>
              updateDoc(doc(db, "transactions", tx.id), {
                historyHidden: true,
                historyHiddenAt: Timestamp.now(),
              })
            )
          );
        }

        if (deleteOption === 'reverse') {
          toast({
            title: "Success",
            description: `Reversed bulk transaction with ${relevantTxs.length} items`,
          });
        } else {
          toast({
            title: "Success",
            description: `Deleted bulk transaction log with ${relevantTxs.length} items`,
          });
        }
        setDeleteConfirmId(null);
        setDeletePassword("");
      } else {
        // Delete single transaction
        const tx = filteredTransactions.find(t => t.id === deleteConfirmId.id);
        
        if (deleteOption === 'reverse' && tx && tx.type !== 'factory_transfer_created' && tx.type !== 'office_transfer_created' && tx.type !== 'sales') {
          // Restore previous balance (for bulk and process transactions)
          const itemId = await findStockItemDocId(tx.itemId, tx.category);
          if (itemId) {
            
            // Prepare the update object
            const updateObj: any = {
              lastUpdated: Timestamp.now(),
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

          await deleteDoc(doc(db, "transactions", tx.id));
        } else if (deleteOption === 'reverse' && tx && (tx.type === 'sales' || tx.type === 'factory_transfer_created' || tx.type === 'office_transfer_created')) {
          // For sales, factory_transfer, and office_transfer, restore location-specific balances
          const itemId = await findStockItemDocId(tx.itemId, tx.category);
          if (itemId) {
            
            // Prepare the update object based on transaction metadata
            const updateObj: any = {
              lastUpdated: Timestamp.now(),
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

          await deleteDoc(doc(db, "transactions", tx.id));
        }

        if (deleteOption === 'reverse') {
          toast({
            title: "Success",
            description: "Transaction reversed successfully",
          });
        } else {
          await updateDoc(doc(db, "transactions", deleteConfirmId.id), {
            historyHidden: true,
            historyHiddenAt: Timestamp.now(),
          });
          toast({
            title: "Success",
            description: "Transaction log deleted successfully",
          });
        }
        
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
      setDeletePassword("");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete transaction",
      });
    } finally {
      setDeleteConfirmId(null);
      setDeletePassword("");
    }
  };

  function sortItemsByName(items: any[]) {
    return [...items].sort((a, b) => {
      return naturalCompare(a.itemId, b.itemId);
    });
  }

  const renderBalanceBreakdown = (entry: any) => {
    if (
      entry.previousHTBalance === undefined ||
      entry.previousFABalance === undefined ||
      entry.previousOFBalance === undefined ||
      entry.newHTBalance === undefined ||
      entry.newFABalance === undefined ||
      entry.newOFBalance === undefined
    ) {
      return null;
    }

    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-blue-50 px-3 py-2 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">HT</div>
            <div className="mt-1 text-xs text-slate-600">
              {entry.previousHTBalance} to <span className="font-semibold text-slate-900">{entry.newHTBalance}</span>
            </div>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">FA</div>
            <div className="mt-1 text-xs text-slate-600">
              {entry.previousFABalance} to <span className="font-semibold text-slate-900">{entry.newFABalance}</span>
            </div>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">OF</div>
            <div className="mt-1 text-xs text-slate-600">
              {entry.previousOFBalance} to <span className="font-semibold text-slate-900">{entry.newOFBalance}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  function groupBulkTransactions(txs: any[]) {
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
  }

  const handleDeleteHistoryByRange = async (range: 'lastMonth' | 'lastQuarter' | 'lastYear' | 'allTime') => {
    if (!validateHistoryPassword(deleteHistoryPassword)) {
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
      setDeleteHistoryRange(null);
      setDeleteHistoryPassword("");
    } catch (error) {
      console.error("Error deleting transactions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete transactions",
      });
    }
  };

  const getDeleteHistoryRangeLabel = (range: 'lastMonth' | 'lastQuarter' | 'lastYear' | 'allTime') => {
    if (range === 'lastMonth') return 'last month';
    if (range === 'lastQuarter') return 'last quarter';
    if (range === 'lastYear') return 'last year';
    return 'all time';
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
              <PopoverContent className="w-64 p-0" align="start">
                <div className="flex flex-col h-96">
                  <div className="p-3 border-b border-slate-200 flex-shrink-0">
                    <div className="flex items-center justify-between">
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
                  </div>
                  <div className="overflow-y-auto flex-1 p-3">
                    <div className="space-y-3">
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
                              {['CEC', 'AGW', 'BRP'].map((company) => (
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
                <DropdownMenuItem onClick={() => {
                  setDeleteHistoryRange('lastMonth');
                  setDeleteHistoryPassword("");
                }}>
                  Delete Last Month
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setDeleteHistoryRange('lastQuarter');
                  setDeleteHistoryPassword("");
                }}>
                  Delete Last Quarter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setDeleteHistoryRange('lastYear');
                  setDeleteHistoryPassword("");
                }}>
                  Delete Last Year
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => {
                    setDeleteHistoryRange('allTime');
                    setDeleteHistoryPassword("");
                  }}
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
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recent Activity</CardTitle>
              <span className="text-xs text-slate-500">
                {loadAllTransactions
                  ? `Showing all ${groupedHistoryItems.length} matching entr${groupedHistoryItems.length === 1 ? "y" : "ies"}`
                  : `Showing latest ${visibleGroupedHistoryItems.length} entr${visibleGroupedHistoryItems.length === 1 ? "y" : "ies"}`}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {visibleGroupedHistoryItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No transactions found
                </div>
              ) : (
                visibleGroupedHistoryItems.map((item) => {
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
                              {firstTx.edited && (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">Edited</Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                              {formatBusinessDate(firstTx.businessDate) && (
                                <span className="text-xs text-slate-500">
                                  Business: <span className="font-medium text-slate-700">{formatBusinessDate(firstTx.businessDate)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog("process", item.id, processTransactions, {
                                  title: "Edit Heat Treatment",
                                  processSerialNumber: firstTx.processSerialNumber,
                                });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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
                              {firstTx.edited && (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">Edited</Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                              {formatBusinessDate(firstTx.businessDate) && (
                                <span className="text-xs text-slate-500">
                                  Business: <span className="font-medium text-slate-700">{formatBusinessDate(firstTx.businessDate)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(item.transferType, item.id, transferTransactions, {
                                  title: item.transferType === "factory_transfer" ? "Edit Factory Transfer" : "Edit Office Transfer",
                                });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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
                              {firstTx.edited && (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">Edited</Badge>
                              )}
                              <span className="text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{firstTx.user.name}</span>
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatExactTime(firstTx.timestamp)}
                              </span>
                              {formatBusinessDate(firstTx.businessDate) && (
                                <span className="text-xs text-slate-500">
                                  Business: <span className="font-medium text-slate-700">{formatBusinessDate(firstTx.businessDate)}</span>
                                </span>
                              )}
                              {firstTx.notes && (
                                <span className="text-xs text-slate-500">
                                  Remarks: <span className="font-medium text-slate-700">{firstTx.notes}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog("sales", item.id, salesTransactions, {
                                  title: "Edit Sale",
                                });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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
                    const canExpandBreakdown =
                      entry.manualStockEdit &&
                      entry.previousHTBalance !== undefined &&
                      entry.previousFABalance !== undefined &&
                      entry.previousOFBalance !== undefined &&
                      entry.newHTBalance !== undefined &&
                      entry.newFABalance !== undefined &&
                      entry.newOFBalance !== undefined;
                    const isExpanded = expandedSingleHistoryId === entry.id;
                    const location = entry.locationId ? locations.find(l => l.id === entry.locationId) : null;
                    return (
                      <div key={entry.id} className="border-b border-slate-100 last:border-b-0">
                        <div
                          className={`p-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-4 ${canExpandBreakdown ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (!canExpandBreakdown) return;
                            setExpandedSingleHistoryId(isExpanded ? null : entry.id);
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {canExpandBreakdown && (
                              <div className="flex-shrink-0">
                                {isExpanded ? (
                                  <ChevronDown className="h-5 w-5 text-slate-400" />
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-slate-400" />
                                )}
                              </div>
                            )}
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
                                {entry.edited && (
                                  <Badge className="bg-amber-100 text-amber-700 text-xs">Edited</Badge>
                                )}
                                {entry.type === 'creation' && (
                                  <Badge className="bg-blue-100 text-blue-700 text-xs">NEW</Badge>
                                )}
                                {entry.manualStockEdit && (
                                  <Badge className="bg-slate-100 text-slate-700 text-xs">MANUAL EDIT</Badge>
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
                                {formatBusinessDate(entry.businessDate) && (
                                  <span className="text-xs text-slate-500">
                                    Business: <span className="font-medium text-slate-700">{formatBusinessDate(entry.businessDate)}</span>
                                  </span>
                                )}
                                {entry.notes && (
                                  <span className="text-xs text-slate-500">
                                    Remarks: <span className="font-medium text-slate-700">{entry.notes}</span>
                                  </span>
                                )}
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
                              {canExpandBreakdown && isExpanded && renderBalanceBreakdown(entry)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`text-sm font-black flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isIncrease ? '+' : ''}{entry.quantityChange}
                            </div>
                            {(entry.type === 'heat_treatment_created' || entry.type === 'factory_transfer_created' || entry.type === 'office_transfer_created' || entry.type === 'sales') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditDialog(
                                    entry.type === "heat_treatment_created"
                                      ? "process"
                                      : entry.type === "factory_transfer_created"
                                      ? "factory_transfer"
                                      : entry.type === "office_transfer_created"
                                      ? "office_transfer"
                                      : "sales",
                                    entry.processId || entry.transferId || entry.salesId || entry.id,
                                    [entry],
                                    {
                                      title: "Edit Entry",
                                      processSerialNumber: entry.processSerialNumber,
                                    }
                                  );
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTransaction(entry.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })
              )}
            </div>
            {!loadAllTransactions && (hasMore || groupedHistoryItems.length > visibleGroupedHistoryItems.length) && (
              <div className="border-t border-slate-100 p-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setGroupDisplayLimit((current) => current + 100)}
                >
                  Load More
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={editState !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditState(null);
              setEditPassword("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editState?.title || "Edit Entry"}</DialogTitle>
              <DialogDescription>
                Update the transaction details, then confirm with the password to apply the edit in place.
              </DialogDescription>
            </DialogHeader>

            {editState && (
              <div className="space-y-4 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Business Date</Label>
                    <Input
                      type="date"
                      value={editState.businessDate}
                      onChange={(e) => setEditState({ ...editState, businessDate: e.target.value })}
                    />
                  </div>

                  {editState.type === "process" ? (
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Serial Number</Label>
                      <Input
                        value={editState.processSerialNumber}
                        onChange={(e) => setEditState({ ...editState, processSerialNumber: e.target.value })}
                        placeholder="Serial number"
                      />
                    </div>
                  ) : editState.type === "sales" ? (
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Selling Company</Label>
                      <Select
                        value={editState.salesCompany}
                        onValueChange={(value: "CEC" | "AGW" | "BRP") => setEditState({ ...editState, salesCompany: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CEC">CEC</SelectItem>
                          <SelectItem value="AGW">AGW</SelectItem>
                          <SelectItem value="BRP">BRP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>

                {editState.type === "sales" && (
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Remarks</Label>
                    <Input
                      value={editState.remarks}
                      onChange={(e) => setEditState({ ...editState, remarks: e.target.value })}
                      placeholder="Optional remarks"
                    />
                  </div>
                )}

                {editState.type === "process" && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-blue-50">
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Update Follow-up Transactions</Label>
                      <p className="text-xs text-slate-600 mt-1">
                        When enabled, changes will automatically apply to matching factory transfer and office transfer transactions
                      </p>
                    </div>
                    <Switch
                      checked={editState.editFollowups || false}
                      onCheckedChange={(checked) =>
                        setEditState({ ...editState, editFollowups: checked })
                      }
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-slate-700">Items</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditState({
                          ...editState,
                          rows: [...editState.rows, { id: "", quantity: "" }],
                        })
                      }
                    >
                      Add Row
                    </Button>
                  </div>

                  {editState.rows.map((row, index) => {
                    const rowItem = items.find((item) => item.id === row.id);
                    const availableBalance =
                      editState.type === "process"
                        ? (rowItem?.heatTreatmentBalance || 0) + (parseInt(row.quantity || "0", 10) || 0)
                        : editState.type === "factory_transfer"
                        ? (rowItem?.heatTreatmentBalance || 0) + (parseInt(row.quantity || "0", 10) || 0)
                        : editState.type === "office_transfer"
                        ? (rowItem?.factoryBalance || 0) + (parseInt(row.quantity || "0", 10) || 0)
                        : (rowItem?.officeBalance || 0) + (parseInt(row.quantity || "0", 10) || 0);

                    const selectableItems = items.filter((item) => {
                      if (editState.type === "process") return true;
                      if (editState.type === "factory_transfer") {
                        return (item.heatTreatmentBalance || 0) > 0 || item.id === row.id;
                      }
                      if (editState.type === "office_transfer") {
                        return (item.factoryBalance || 0) > 0 || item.id === row.id;
                      }
                      return (item.officeBalance || 0) > 0 || item.id === row.id;
                    }).sort((a, b) => {
                      const nameCompare = naturalCompare(a.name, b.name);
                      if (nameCompare !== 0) return nameCompare;
                      return naturalCompare(a.category, b.category);
                    });

                    return (
                      <>
                        <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_120px_52px]">
                          <div>
                            <Label className="text-xs font-semibold">Item</Label>
                            <SearchableSelect
                              value={row.id}
                              onValueChange={(value) => {
                                const rows = [...editState.rows];
                                rows[index] = { ...rows[index], id: value };
                                setEditState({ ...editState, rows });
                              }}
                              placeholder="Select item"
                              items={selectableItems.map((item) => {
                                let label = `${capitalize(item.name)} - ${capitalize(item.category)}`;
                                if (editState.type === "process") {
                                  // Heat treatment - no source balance shown
                                  label = `${capitalize(item.name)} - ${capitalize(item.category)}`;
                                } else if (editState.type === "factory_transfer") {
                                  // Factory transfer - show HT balance before dash
                                  label = `${capitalize(item.name)} (HT: ${((item as any).heatTreatmentBalance || 0)}) - ${capitalize(item.category)}`;
                                } else if (editState.type === "office_transfer") {
                                  // Office transfer - show FA balance before dash
                                  label = `${capitalize(item.name)} (FA: ${((item as any).factoryBalance || 0)}) - ${capitalize(item.category)}`;
                                } else if (editState.type === "sales") {
                                  // Sales - show OF balance before dash
                                  label = `${capitalize(item.name)} (OF: ${((item as any).officeBalance || 0)}) - ${capitalize(item.category)}`;
                                }
                                return { id: item.id, label };
                              })}
                            />
                          </div>

                          <div>
                            <Label className="text-xs font-semibold">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              max={availableBalance}
                              value={row.quantity}
                              onFocus={selectAllOnFocus}
                              onChange={(e) => {
                                const rows = [...editState.rows];
                                rows[index] = { ...rows[index], quantity: e.target.value };
                                setEditState({ ...editState, rows });
                              }}
                            />
                          </div>

                          <div className="flex items-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                const rows = editState.rows.filter((_, rowIndex) => rowIndex !== index);
                                setEditState({
                                  ...editState,
                                  rows: rows.length > 0 ? rows : [{ id: "", quantity: "" }],
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Show balance info based on transaction type */}
                        {rowItem && editState?.type === "process" && (
                          <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700 font-semibold col-span-full mt-2">
                            HT Balance: {rowItem.heatTreatmentBalance || 0} | FA Balance: {rowItem.factoryBalance || 0} | OF Balance: {rowItem.officeBalance || 0}
                          </div>
                        )}
                        {rowItem && editState?.type === "factory_transfer" && (
                          <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700 font-semibold col-span-full mt-2">
                            HT Balance: {rowItem.heatTreatmentBalance || 0} | FA Balance: {rowItem.factoryBalance || 0} | OF Balance: {rowItem.officeBalance || 0}
                          </div>
                        )}
                        {rowItem && editState?.type === "office_transfer" && (
                          <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700 font-semibold col-span-full mt-2">
                            HT Balance: {rowItem.heatTreatmentBalance || 0} | FA Balance: {rowItem.factoryBalance || 0} | OF Balance: {rowItem.officeBalance || 0}
                          </div>
                        )}
                        {rowItem && editState?.type === "sales" && (
                          <div className="p-2 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700 font-semibold col-span-full mt-2">
                            OF Balance: {rowItem.officeBalance || 0}
                          </div>
                        )}
                      </>
                    );
                  })}
                </div><div>
                  <Label className="text-sm font-medium text-slate-700">Password</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    name="history-edit-code"
                    data-form-type="other"
                    data-lpignore="true"
                    spellCheck={false}
                    maxLength={4}
                    placeholder="Enter 4-digit password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditState(null);
                  setEditPassword("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditConfirm} disabled={isEditSubmitting}>
                {isEditSubmitting ? "Saving..." : "Confirm Edit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Non-Matching Follow-Up Mirrors Dialog */}
        <Dialog
          open={nonMatchingMirrorsDialog?.show || false}
          onOpenChange={(open) => {
            if (!open) {
              setNonMatchingMirrorsDialog(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Follow-up Transactions Don't Match</DialogTitle>
              <DialogDescription>
                The follow-up transactions (Factory Transfer / Office Transfer) are not identical to this Heat Treatment transaction.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <strong>What does this mean?</strong> When you enabled "Update Follow-up Transactions," we looked for factory transfer or office transfer transactions that have the same items and quantities as this heat treatment. However, the follow-up transactions don't match exactly, so we can't safely update them.
                </p>
              </div>
              <p className="text-sm text-slate-700">
                Would you like to:
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setNonMatchingMirrorsDialog(null);
                  setEditState(null);
                  setEditPassword("");
                }}
              >
                Cancel Edit
              </Button>
              <Button
                onClick={() => {
                  nonMatchingMirrorsDialog?.proceed?.();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Edit Only This Transaction
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* No Follow-ups Found Dialog */}
        <Dialog open={noFollowUpsDialog} onOpenChange={setNoFollowUpsDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>No Follow-up Transactions Found</DialogTitle>
              <DialogDescription>
                "Update Follow-up Transactions" is enabled, but no matching follow-ups exist.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-red-50 rounded border border-red-200">
                <p className="text-sm text-red-800">
                  <strong>What does this mean?</strong> You enabled "Update Follow-up Transactions," but we couldn't find any factory transfer or office transfer transactions created after this heat treatment. To proceed, you must turn off the toggle.
                </p>
              </div>
              <p className="text-sm text-slate-700">
                Your options:
              </p>
              <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                <li>Turn off the "Update Follow-up Transactions" toggle and try editing again</li>
                <li>Cancel this edit if you expected follow-up transactions to exist</li>
              </ul>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setNoFollowUpsDialog(false);
                  setEditState(null);
                  setEditPassword("");
                }}
              >
                Cancel Edit
              </Button>
              <Button
                onClick={() => {
                  setNoFollowUpsDialog(false);
                  // Toggle off the editFollowups flag
                  if (editState) {
                    setEditState({
                      ...editState,
                      editFollowups: false,
                    });
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Turn Off Toggle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteConfirmId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteConfirmId(null);
              setDeletePassword("");
            }
          }}
        >
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
                <label htmlFor="history-action-password" className="text-sm font-medium text-slate-700">
                  4-digit password
                </label>
                <Input
                  id="history-action-password"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="history-action-code"
                  data-form-type="other"
                  data-lpignore="true"
                  spellCheck={false}
                  maxLength={4}
                  placeholder="Enter password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
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
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmId(null);
                  setDeletePassword("");
                }}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleteHistoryRange !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteHistoryRange(null);
              setDeleteHistoryPassword("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Delete History Range</DialogTitle>
              <DialogDescription>
                {deleteHistoryRange
                  ? `Delete transactions from ${getDeleteHistoryRangeLabel(deleteHistoryRange)}. This cannot be undone.`
                  : "Delete a selected range of history."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="history-range-delete-code">4-digit code</Label>
                <Input
                  id="history-range-delete-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="history-range-delete-code"
                  data-form-type="other"
                  data-lpignore="true"
                  spellCheck={false}
                  maxLength={4}
                  placeholder="Enter code"
                  value={deleteHistoryPassword}
                  onChange={(e) => setDeleteHistoryPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteHistoryRange(null);
                  setDeleteHistoryPassword("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteHistoryRange) {
                    handleDeleteHistoryByRange(deleteHistoryRange);
                  }
                }}
              >
                Delete History
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
