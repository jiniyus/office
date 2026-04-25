import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Trash2, Minus, Check, X, ArrowRightLeft, Zap, Filter, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState, useMemo, useEffect, type FocusEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStockItems, useLocations } from "@/lib/firestore-hooks";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { collection, addDoc, Timestamp, updateDoc, doc, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { capitalize, naturalCompare } from "@/lib/utils";

export default function Stock() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | undefined>(undefined);
  const [transferData, setTransferData] = useState({
    targetLocationId: "",
    quantity: "",
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [editingQuantityId, setEditingQuantityId] = useState<string | undefined>(undefined);
  const [expandedBalanceId, setExpandedBalanceId] = useState<string | undefined>(undefined);
  const [filterByLocationBalance, setFilterByLocationBalance] = useState<'heat_treatment' | 'factory' | 'office' | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [tempQuantity, setTempQuantity] = useState<{[key: string]: string}>({});
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isSalesDialogOpen, setIsSalesDialogOpen] = useState(false);
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [bulkTransactionRows, setBulkTransactionRows] = useState<Array<{
    id: string;
    quantity: string;
    operation: "Add" | "Deduct";
    locationId: string;
  }>>([{
    id: "",
    quantity: "",
    operation: "Add",
    locationId: "",
  }]);
  const [salesRows, setSalesRows] = useState<Array<{
    id: string;
    quantity: string;
  }>>([{
    id: "",
    quantity: "",
  }]);
  const [selectedSalesCompany, setSelectedSalesCompany] = useState<"CEC" | "AGW" | "BRP" | "">("");
  const [salesDate, setSalesDate] = useState(new Date());
  const [salesRemarks, setSalesRemarks] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    heatTreatmentQuantity: "",
    factoryQuantity: "",
    officeQuantity: "",
  });
  const [editingProductId, setEditingProductId] = useState<string | undefined>(undefined);
  const [editingProductInfo, setEditingProductInfo] = useState({
    name: "",
    category: "",
  });
  const [editProductBalances, setEditProductBalances] = useState({
    heatTreatmentQuantity: "",
    factoryQuantity: "",
    officeQuantity: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load advanced mode from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem("stockpro-advanced-mode") === "true";
    setAdvancedMode(savedMode);
  }, []);

  // Listen for mode changes from layout component
  useEffect(() => {
    const handleModeChange = () => {
      const savedMode = localStorage.getItem("stockpro-advanced-mode") === "true";
      setAdvancedMode(savedMode);
    };

    window.addEventListener("stockpro-mode-changed", handleModeChange);
    return () => window.removeEventListener("stockpro-mode-changed", handleModeChange);
  }, []);

  // Reset bulk transaction rows when opening dialog
  useEffect(() => {
    if (isBulkDialogOpen && bulkTransactionRows.length === 0) {
      setBulkTransactionRows([{
        id: "",
        quantity: "",
        operation: "Add",
        locationId: "",
      }]);
    }
  }, [isBulkDialogOpen]);

  // Reset sales rows when opening dialog
  useEffect(() => {
    if (isSalesDialogOpen && salesRows.length === 0) {
      setSalesRows([{
        id: "",
        quantity: "",
      }]);
      setSelectedSalesCompany("");
      setSalesDate(new Date());
      setSalesRemarks("");
    }
  }, [isSalesDialogOpen]);
  
  const { items, loading } = useStockItems();
  const { locations } = useLocations();
  const { user } = useAuth();
  const { toast } = useToast();

  // Helper function to sort items by name and category using natural sort
  const sortItems = (itemsToSort: typeof items) => {
    return [...itemsToSort].sort((a, b) => {
      const nameCompare = naturalCompare(a.name, b.name);
      if (nameCompare !== 0) return nameCompare;
      
      return naturalCompare(a.category, b.category);
    });
  };

  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map(item => item.category)));
    return cats.sort();
  }, [items]);

  const selectAllOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  const getNextHeatTreatmentSerialNumber = async () => {
    const processesSnapshot = await getDocs(query(collection(db, "processes")));
    const maxSerialNumber = processesSnapshot.docs.reduce((maxValue, docSnap) => {
      const serialValue = parseInt(String(docSnap.data().serialNumber || "0"), 10);
      if (Number.isNaN(serialValue)) return maxValue;
      return Math.max(maxValue, serialValue);
    }, 0);

    return String(maxSerialNumber + 1);
  };

  const createManualHeatTreatmentProcess = async ({
    stockItemId,
    itemName,
    category,
    quantity,
  }: {
    stockItemId: string;
    itemName: string;
    category: string;
    quantity: number;
  }) => {
    if (quantity <= 0) return;

    const serialNumber = await getNextHeatTreatmentSerialNumber();
    const now = Timestamp.now();
    const processItems = [{
      itemId: stockItemId,
      itemName,
      category,
      quantity,
    }];

    await addDoc(collection(db, "processes"), {
      serialNumber,
      date: now,
      processType: "heat_treatment",
      items: processItems,
      originalItems: processItems,
      source: "manual_stock_edit",
      createdAt: now,
      createdBy: {
        id: user?.uid || "",
        name: user?.displayName || "Unknown",
      },
    });
  };

  const getTotalBalance = (item: any) => {
    return ((item.heatTreatmentBalance || 0) + (item.factoryBalance || 0) + (item.officeBalance || 0));
  };

  const getDisplayBalance = (item: any) => {
    if (filterByLocationBalance === 'heat_treatment') {
      return ((item as any).heatTreatmentBalance || 0);
    } else if (filterByLocationBalance === 'factory') {
      return ((item as any).factoryBalance || 0);
    } else if (filterByLocationBalance === 'office') {
      return ((item as any).officeBalance || 0);
    }
    return getTotalBalance(item);
  };

  const filteredInventory = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategories.length === 0 || 
        selectedCategories.includes(item.category);
      const matchesName = selectedNames.length === 0 || 
        selectedNames.includes(item.name);
      
      // Filter by location balance
      let matchesLocationBalance = true;
      if (filterByLocationBalance) {
        if (filterByLocationBalance === 'heat_treatment') {
          matchesLocationBalance = ((item as any).heatTreatmentBalance || 0) > 0;
        } else if (filterByLocationBalance === 'factory') {
          matchesLocationBalance = ((item as any).factoryBalance || 0) > 0;
        } else if (filterByLocationBalance === 'office') {
          matchesLocationBalance = ((item as any).officeBalance || 0) > 0;
        }
      }
      
      return matchesSearch && matchesCategory && matchesName && matchesLocationBalance;
    }).sort((a, b) => {
      const nameCompare = naturalCompare(a.name, b.name);
      if (nameCompare !== 0) return nameCompare;
      return naturalCompare(a.category, b.category);
    });
  }, [items, searchTerm, selectedCategories, selectedNames, filterByLocationBalance]);

  const handleQuantityUpdate = async (itemId: string, delta: number) => {
    if (delta === 0) return;
    try {
      const itemRef = doc(db, "stock-items", itemId);
      const currentItem = items.find(i => i.id === itemId);
      if (!currentItem) return;
      const previousQty = currentItem.quantity;
      const newQty = Math.max(0, previousQty + delta);
      await updateDoc(itemRef, { quantity: newQty, lastUpdated: Timestamp.now() });
      await addDoc(collection(db, "transactions"), {
        itemId: currentItem.name,
        category: currentItem.category,
        company: user?.company || "",
        quantityChange: delta,
        previousBalance: previousQty,
        balance: newQty,
        locationId: currentItem.locationId || null,
        timestamp: Timestamp.now(),
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      toast({ title: "Success", description: `Quantity updated by ${delta > 0 ? '+' : ''}${delta}` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update quantity" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, "stock-items", itemId));
      toast({ title: "Success", description: "Item deleted successfully" });
      setDeleteConfirmId(undefined);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete item" });
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.category) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in product name and category" });
      return;
    }
    setIsSubmitting(true);
    try {
      const initialHTBalance = Math.max(0, parseInt(newProduct.heatTreatmentQuantity || "0", 10) || 0);
      const initialFABalance = Math.max(0, parseInt(newProduct.factoryQuantity || "0", 10) || 0);
      const initialOFBalance = Math.max(0, parseInt(newProduct.officeQuantity || "0", 10) || 0);
      const initialQuantity = initialHTBalance + initialFABalance + initialOFBalance;
      const trimmedName = newProduct.name.trim();
      const trimmedCategory = newProduct.category.trim();
      const stockDocRef = await addDoc(collection(db, "stock-items"), {
        name: trimmedName,
        category: trimmedCategory,
        quantity: initialQuantity,
        heatTreatmentBalance: initialHTBalance,
        factoryBalance: initialFABalance,
        officeBalance: initialOFBalance,
        company: user?.company || "",
        createdAt: Timestamp.now(),
        createdBy: user?.email || "",
      });
      await addDoc(collection(db, "transactions"), {
        itemId: trimmedName,
        category: trimmedCategory,
        company: user?.company || "",
        quantityChange: initialQuantity,
        previousBalance: 0,
        balance: initialQuantity,
        timestamp: Timestamp.now(),
        type: 'creation',
        previousHTBalance: 0,
        previousFABalance: 0,
        previousOFBalance: 0,
        newHTBalance: initialHTBalance,
        newFABalance: initialFABalance,
        newOFBalance: initialOFBalance,
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      await createManualHeatTreatmentProcess({
        stockItemId: stockDocRef.id,
        itemName: trimmedName,
        category: trimmedCategory,
        quantity: initialHTBalance,
      });
      toast({ title: "Success", description: "Product added successfully" });
      resetProductDialog();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add product" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetProductDialog = () => {
    setIsAddDialogOpen(false);
    setEditingProductId(undefined);
    setEditingProductInfo({ name: "", category: "" });
    setNewProduct({
      name: "",
      category: "",
      heatTreatmentQuantity: "",
      factoryQuantity: "",
      officeQuantity: "",
    });
    setEditProductBalances({
      heatTreatmentQuantity: "",
      factoryQuantity: "",
      officeQuantity: "",
    });
  };

  const openEditProductDialog = (item: any) => {
    setEditingProductId(item.id);
    setEditingProductInfo({
      name: item.name,
      category: item.category,
    });
    setEditProductBalances({
      heatTreatmentQuantity: ((item as any).heatTreatmentBalance || 0).toString(),
      factoryQuantity: ((item as any).factoryBalance || 0).toString(),
      officeQuantity: ((item as any).officeBalance || 0).toString(),
    });
    setIsAddDialogOpen(true);
  };

  const handleEditProduct = async () => {
    if (!editingProductId) return;

    const currentItem = items.find((item) => item.id === editingProductId);
    if (!currentItem) {
      toast({ variant: "destructive", title: "Error", description: "Selected item was not found" });
      return;
    }

    const nextHTBalance = Math.max(0, parseInt(editProductBalances.heatTreatmentQuantity || "0", 10) || 0);
    const nextFABalance = Math.max(0, parseInt(editProductBalances.factoryQuantity || "0", 10) || 0);
    const nextOFBalance = Math.max(0, parseInt(editProductBalances.officeQuantity || "0", 10) || 0);

    const previousHTBalance = (currentItem as any).heatTreatmentBalance || 0;
    const previousFABalance = (currentItem as any).factoryBalance || 0;
    const previousOFBalance = (currentItem as any).officeBalance || 0;
    const previousTotal = previousHTBalance + previousFABalance + previousOFBalance;
    const nextTotal = nextHTBalance + nextFABalance + nextOFBalance;
    const quantityChange = nextTotal - previousTotal;
    const createdHTQuantity = Math.max(0, nextHTBalance - previousHTBalance);

    try {
      setIsSubmitting(true);
      const now = Timestamp.now();

      await updateDoc(doc(db, "stock-items", editingProductId), {
        heatTreatmentBalance: nextHTBalance,
        factoryBalance: nextFABalance,
        officeBalance: nextOFBalance,
        quantity: nextTotal,
        lastUpdated: now,
      });

      await addDoc(collection(db, "transactions"), {
        itemId: currentItem.name,
        category: currentItem.category,
        company: user?.company || "",
        notes: "Manual stock balance edit",
        quantityChange,
        previousBalance: previousTotal,
        balance: nextTotal,
        locationId: currentItem.locationId || null,
        timestamp: now,
        type: "adjustment",
        affectedBalance: "manual_stock_edit",
        previousHTBalance,
        previousFABalance,
        previousOFBalance,
        newHTBalance: nextHTBalance,
        newFABalance: nextFABalance,
        newOFBalance: nextOFBalance,
        historyDeleteOnly: true,
        manualStockEdit: true,
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      await createManualHeatTreatmentProcess({
        stockItemId: editingProductId,
        itemName: currentItem.name,
        category: currentItem.category,
        quantity: createdHTQuantity,
      });

      toast({ title: "Success", description: "Stock balances updated successfully" });
      resetProductDialog();
    } catch (error) {
      console.error("Error editing stock balances:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to update stock balances" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferStock = async () => {
    if (!transferSourceId || !transferData.targetLocationId || !transferData.quantity) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all fields" });
      return;
    }
    try {
      const sourceItem = items.find(i => i.id === transferSourceId);
      if (!sourceItem) return;
      const transferQty = parseInt(transferData.quantity);
      if (transferQty <= 0 || transferQty > sourceItem.quantity) {
        toast({ variant: "destructive", title: "Error", description: "Invalid transfer quantity" });
        return;
      }
      const targetItem = items.find(item => {
        const sourceName = sourceItem.name.trim().toLowerCase();
        const sourceCategory = sourceItem.category.trim().toLowerCase();
        const sourceSize = (sourceItem.size || "").trim().toLowerCase();
        return (
          item.name.trim().toLowerCase() === sourceName &&
          item.category.trim().toLowerCase() === sourceCategory &&
          (item.size || "").trim().toLowerCase() === sourceSize &&
          item.locationId === transferData.targetLocationId
        );
      });
      if (!targetItem) {
        toast({ variant: "destructive", title: "Error", description: `No matching stock found in target location.` });
        return;
      }
      const sourceNewQty = sourceItem.quantity - transferQty;
      const targetNewQty = targetItem.quantity + transferQty;
      await updateDoc(doc(db, "stock-items", sourceItem.id), { quantity: sourceNewQty, lastUpdated: Timestamp.now() });
      await updateDoc(doc(db, "stock-items", targetItem.id), { quantity: targetNewQty, lastUpdated: Timestamp.now() });
      await addDoc(collection(db, "transactions"), {
        itemId: sourceItem.name, category: sourceItem.category, company: user?.company || "",
        quantityChange: -transferQty, previousBalance: sourceItem.quantity, balance: sourceNewQty,
        locationId: sourceItem.locationId || null, timestamp: Timestamp.now(), type: 'transfer',
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      await addDoc(collection(db, "transactions"), {
        itemId: targetItem.name, category: targetItem.category, company: user?.company || "",
        quantityChange: transferQty, previousBalance: targetItem.quantity, balance: targetNewQty,
        locationId: targetItem.locationId || null, timestamp: Timestamp.now(), type: 'transfer',
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      toast({ title: "Success", description: `Transferred ${transferQty} units successfully` });
      setIsTransferDialogOpen(false);
      setTransferSourceId(undefined);
      setTransferData({ targetLocationId: "", quantity: "" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to transfer stock" });
    }
  };

  const handleAddBulkRow = () => {
    setBulkTransactionRows([...bulkTransactionRows, {
      id: "",
      quantity: "",
      operation: "Add",
      locationId: "",
    }]);
    // Auto-collapse previously expanded row
    setExpandedRowIndex(null);
  };

  const handleRemoveBulkRow = (index: number) => {
    setBulkTransactionRows(bulkTransactionRows.filter((_, i) => i !== index));
  };

  const handleBulkTransactionConfirm = async () => {
    if (bulkTransactionRows.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Please add at least one transaction row" });
      return;
    }

    // Check for duplicate items
    const itemIds = new Set<string>();
    const duplicates: { itemName: string; rows: number[] }[] = [];

    bulkTransactionRows.forEach((row, idx) => {
      if (row.id) {
        if (itemIds.has(row.id)) {
          const item = items.find(i => i.id === row.id);
          const existingDup = duplicates.find(d => d.itemName === item?.name);
          if (existingDup) {
            existingDup.rows.push(idx + 1);
          } else {
            duplicates.push({ itemName: item?.name || row.id, rows: [idx + 1] });
          }
        } else {
          itemIds.add(row.id);
        }
      }
    });

    if (duplicates.length > 0) {
      const dupList = duplicates.map(d => `${d.itemName} (rows: ${d.rows.join(", ")})`).join(", ");
      toast({
        variant: "destructive",
        title: "Error",
        description: `Duplicate items not allowed: ${dupList}. Each item can only appear once per bulk transaction.`
      });
      return;
    }

    // Validate all rows
    for (let i = 0; i < bulkTransactionRows.length; i++) {
      const row = bulkTransactionRows[i];
      if (!row.id || !row.quantity) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Please select item and quantity` });
        return;
      }
      const qty = parseInt(row.quantity);
      if (qty <= 0) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Quantity must be greater than 0` });
        return;
      }
      const item = items.find(it => it.id === row.id);
      if (!item) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Invalid item` });
        return;
      }
      if (row.operation === "Deduct" && qty > item.quantity) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Cannot deduct more than available quantity (${item.quantity})` });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const bulkTransactionId = `bulk-${Date.now()}`;
      const transactionRecords = [];

      for (const row of bulkTransactionRows) {
        const item = items.find(it => it.id === row.id)!;
        const qty = parseInt(row.quantity);
        const delta = row.operation === "Add" ? qty : -qty;
        const newQty = Math.max(0, item.quantity + delta);

        // Update stock
        await updateDoc(doc(db, "stock-items", item.id), {
          quantity: newQty,
          lastUpdated: Timestamp.now()
        });

        // Record transaction
        transactionRecords.push({
          itemId: item.name,
          category: item.category,
          company: user?.company || "",
          quantityChange: delta,
          previousBalance: item.quantity,
          balance: newQty,
          locationId: item.locationId || null,
          timestamp: Timestamp.now(),
          type: 'bulk',
          bulkTransactionId: bulkTransactionId,
          affectedBalance: 'quantity',
          previousHTBalance: (item as any).heatTreatmentBalance || 0,
          previousFABalance: (item as any).factoryBalance || 0,
          previousOFBalance: (item as any).officeBalance || 0,
          newHTBalance: (item as any).heatTreatmentBalance || 0,
          newFABalance: (item as any).factoryBalance || 0,
          newOFBalance: (item as any).officeBalance || 0,
          user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
        });
      }

      // Save all transaction records
      for (const record of transactionRecords) {
        await addDoc(collection(db, "transactions"), record);
      }

      toast({ title: "Success", description: `Bulk transaction completed with ${bulkTransactionRows.length} items` });
      setIsBulkDialogOpen(false);
      setBulkTransactionRows([]);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to process bulk transaction" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalesConfirm = async () => {
    if (!selectedSalesCompany) {
      toast({ variant: "destructive", title: "Error", description: "Please select a company" });
      return;
    }

    if (salesRows.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Please add at least one item to sell" });
      return;
    }

    // Validate all rows
    for (let i = 0; i < salesRows.length; i++) {
      const row = salesRows[i];
      if (!row.id || !row.quantity) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Please select item and quantity` });
        return;
      }
      const qty = parseInt(row.quantity);
      if (qty <= 0) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Quantity must be greater than 0` });
        return;
      }
      const item = items.find(it => it.id === row.id);
      if (!item) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Invalid item` });
        return;
      }
      const ofBalance = (item as any).officeBalance || 0;
      if (qty > ofBalance) {
        toast({ variant: "destructive", title: "Error", description: `Row ${i + 1}: Cannot sell more than available office balance (${ofBalance})` });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const salesId = `sales-${Date.now()}`;
      const transactionRecords = [];
      
      // Get office transfer processes once and keep a mutable copy
      const processesSnapshot = await getDocs(query(collection(db, "processes"), where("processType", "==", "office_transfer")));
      let updatedProcesses: any[] = processesSnapshot.docs
        .map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
            items: data.items || [],
            ...data
          };
        })
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const row of salesRows) {
        const item = items.find(it => it.id === row.id)!;
        const qty = parseInt(row.quantity);
        const ofBalance = (item as any).officeBalance || 0;
        const htBalance = (item as any).heatTreatmentBalance || 0;
        const faBalance = (item as any).factoryBalance || 0;

        const newOFBalance = Math.max(0, ofBalance - qty);
        const newTotalQty = htBalance + faBalance + newOFBalance;

        // Update stock - only deduct from office balance
        await updateDoc(doc(db, "stock-items", item.id), {
          officeBalance: newOFBalance,
          quantity: newTotalQty,
          lastUpdated: Timestamp.now()
        });

        // Update office transfer processes in FIFO order
        const ofProcesses = updatedProcesses
          .filter(p => p.items.some((pi: any) => pi.itemId === item.id))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        let remainingQtyToDeduct = qty;
        
        for (const ofProcess of ofProcesses) {
          if (remainingQtyToDeduct <= 0) break;
          
          // Find this process in updatedProcesses
          const processIndex = updatedProcesses.findIndex(p => p.id === ofProcess.id);
          if (processIndex === -1) continue;
          
          const processToUpdate = updatedProcesses[processIndex];
          
          // Find the specific item in this process
          let foundItemIndex = processToUpdate.items.findIndex((pi: any) => pi.itemId === item.id);
          
          if (foundItemIndex !== -1) {
            const processItem = processToUpdate.items[foundItemIndex];
            const currentQty = processItem.quantity;
            const deductAmount = Math.min(currentQty, remainingQtyToDeduct);
            remainingQtyToDeduct -= deductAmount;
            
            processToUpdate.items[foundItemIndex] = {
              ...processItem,
              quantity: currentQty - deductAmount
            };
            
            // Remove items with 0 quantity
            processToUpdate.items = processToUpdate.items.filter((pi: any) => pi.quantity > 0);
          }

          // Mark process for update in Firestore
          if (processToUpdate.items.length === 0) {
            // Mark for deletion
            updatedProcesses[processIndex] = { ...processToUpdate, _delete: true };
          } else {
            // Mark for update
            updatedProcesses[processIndex] = { ...processToUpdate, _update: true };
          }
        }

        // Record transaction
        transactionRecords.push({
          itemId: item.name,
          category: item.category,
          company: user?.company || "",
          notes: salesRemarks.trim() || null,
          businessDate: Timestamp.fromDate(salesDate),
          quantityChange: -qty,
          previousBalance: ofBalance,
          balance: newOFBalance,
          locationId: null,
          timestamp: Timestamp.now(),
          type: 'sales',
          salesId: salesId,
          salesCompany: selectedSalesCompany,
          edited: false,
          affectedBalance: 'officeBalance',
          previousHTBalance: htBalance,
          previousFABalance: faBalance,
          previousOFBalance: ofBalance,
          newHTBalance: htBalance,
          newFABalance: faBalance,
          newOFBalance: newOFBalance,
          user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
        });
      }

      // Now apply all Firestore updates for processes
      for (const process of updatedProcesses) {
        if (process._delete) {
          await deleteDoc(doc(db, "processes", process.id));
        } else if (process._update) {
          const { _delete, _update, ...processData } = process;
          await updateDoc(doc(db, "processes", process.id), {
            items: process.items,
          });
        }
      }

      // Save all transaction records
      for (const record of transactionRecords) {
        await addDoc(collection(db, "transactions"), record);
      }

      toast({ title: "Success", description: `Sale completed with ${salesRows.length} items to ${selectedSalesCompany}` });
      setIsSalesDialogOpen(false);
      setSalesRows([{ id: "", quantity: "" }]);
      setSelectedSalesCompany("");
      setSalesDate(new Date());
      setSalesRemarks("");
    } catch (error) {
      console.error("Error processing sale:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to process sale" });
    } finally {
      setIsSubmitting(false);
    }
  };



  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64"><Spinner /></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventory Stock</h1>
            <p className="text-slate-500 mt-1">Manage your products and view real-time stock levels.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Button
                className="flex-1 h-10 shadow-lg shadow-primary/20"
                onClick={() => {
                  setEditingProductId(undefined);
                  setEditingProductInfo({ name: "", category: "" });
                  setEditProductBalances({
                    heatTreatmentQuantity: "",
                    factoryQuantity: "",
                    officeQuantity: "",
                  });
                  setIsAddDialogOpen(true);
                }}
                disabled={isViewOnly}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-semibold text-slate-700">Stock View</span>
                <Switch checked={isViewOnly} onCheckedChange={setIsViewOnly} />
              </div>
            </div>

            <Button
              className="w-full h-10 shadow-lg shadow-green-600/20 bg-green-600 hover:bg-green-700"
              onClick={() => setIsSalesDialogOpen(true)}
              disabled={isViewOnly}
            >
              <Zap className="mr-2 h-4 w-4" /> Sales
            </Button>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {/* Search Bar with Filter */}
            <div className="flex items-center gap-2 p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  className="pl-9 bg-white border-slate-200 focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
                    {(selectedNames.length > 0 || selectedCategories.length > 0 || filterByLocationBalance) && (
                      <Badge className="bg-blue-100 text-blue-700 h-5 rounded-full text-xs">
                        {selectedNames.length + selectedCategories.length + (filterByLocationBalance ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="flex flex-col h-96 overflow-y-auto">
                    {/* Name Filter - With its own scroll */}
                    <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-700">Name</h3>
                        {selectedNames.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                            onClick={() => setSelectedNames([])}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {Array.from(new Set(items.map(item => item.name)))
                          .sort((a, b) => naturalCompare(a, b))
                          .map((name) => (
                          <label key={name} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedNames.includes(name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedNames([...selectedNames, name]);
                                } else {
                                  setSelectedNames(selectedNames.filter(n => n !== name));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-slate-600">{capitalize(name)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Category Filter */}
                    <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-700">Category</h3>
                        {selectedCategories.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                            onClick={() => setSelectedCategories([])}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {categories.map((category) => (
                          <label key={category} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(category)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategories([...selectedCategories, category]);
                                } else {
                                  setSelectedCategories(selectedCategories.filter(c => c !== category));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-slate-600">{capitalize(category)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Location Balance Filter */}
                    <div className="px-3 py-2 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-700">Location Balance</h3>
                        {filterByLocationBalance && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                            onClick={() => setFilterByLocationBalance(null)}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={filterByLocationBalance === null}
                            onChange={() => setFilterByLocationBalance(null)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-slate-600">All Locations</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={filterByLocationBalance === 'heat_treatment'}
                            onChange={() => setFilterByLocationBalance('heat_treatment')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-slate-600">Heat Treatment</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={filterByLocationBalance === 'factory'}
                            onChange={() => setFilterByLocationBalance('factory')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-slate-600">Factory</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={filterByLocationBalance === 'office'}
                            onChange={() => setFilterByLocationBalance('office')}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm text-slate-600">Office</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Unified Card View — same on mobile and desktop */}
            <div className="divide-y divide-slate-100">
              {filteredInventory.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No products found</div>
              ) : (
                filteredInventory.map((item) => {
                  const location = item.locationId ? locations.find(l => l.id === item.locationId) : null;
                  return isViewOnly ? (
                    // View Only Mode - Compact single line with all balances
                    <div key={item.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-base">{capitalize(item.name)}</div>
                          <p className="text-sm font-semibold text-slate-700 mt-0.5">{capitalize(item.category)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Display Balance - location specific if filter active, total otherwise */}
                          <div className="bg-blue-600 text-white rounded font-bold px-2 py-0.5 text-xs flex items-center justify-center min-w-fit">
                            {getDisplayBalance(item)}
                          </div>
                          {/* Show individual balances only if no location filter is active */}
                          {!filterByLocationBalance && (
                            <>
                              {/* HT Balance */}
                              <div className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-xs font-semibold min-w-fit">
                                HT: {(item as any).heatTreatmentBalance || 0}
                              </div>
                              {/* FA Balance */}
                              <div className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-xs font-semibold min-w-fit">
                                FA: {(item as any).factoryBalance || 0}
                              </div>
                              {/* OF Balance */}
                              <div className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-xs font-semibold min-w-fit">
                                OF: {(item as any).officeBalance || 0}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Full Edit Mode
                    <div key={item.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900 text-lg">{capitalize(item.name)}</div>
                          <div className="text-sm text-slate-600 mt-1 font-medium">{capitalize(item.category)}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                            onClick={() => openEditProductDialog(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteConfirmId(item.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span />
                          <span className="text-slate-500 text-xs uppercase tracking-wider font-bold">Quantity</span>
                        </div>
                        <div className="flex items-end justify-between gap-4">
                          <span className="text-slate-500 text-sm font-medium">Stock Balances</span>
                          <div className="flex flex-col items-end gap-2">
                            {/* Balance with Expandable - shows location-specific if filter active, total otherwise */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 hover:bg-transparent"
                              onClick={() => setExpandedBalanceId(expandedBalanceId === item.id ? undefined : item.id)}
                            >
                              <div className="flex items-center gap-2">
                                <div className="bg-blue-600 text-white rounded font-bold px-3 py-1 flex items-center justify-center">
                                  {getDisplayBalance(item)}
                                </div>
                                {expandedBalanceId === item.id ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                )}
                              </div>
                            </Button>
                            
                            {/* Expanded Breakdown */}
                            {expandedBalanceId === item.id && (
                              <div className="w-full pt-2 border-t border-slate-200">
                                <div className="flex gap-1">
                                  <div className="flex-1 bg-blue-100 text-blue-700 rounded px-2 py-1 text-xs font-semibold text-center flex flex-col items-center justify-center">
                                    <div>HT</div>
                                    <div>{(item as any).heatTreatmentBalance || 0}</div>
                                  </div>
                                  <div className="flex-1 bg-blue-100 text-blue-700 rounded px-2 py-1 text-xs font-semibold text-center flex flex-col items-center justify-center">
                                    <div>FA</div>
                                    <div>{(item as any).factoryBalance || 0}</div>
                                  </div>
                                  <div className="flex-1 bg-blue-100 text-blue-700 rounded px-2 py-1 text-xs font-semibold text-center flex flex-col items-center justify-center">
                                    <div>OF</div>
                                    <div>{(item as any).officeBalance || 0}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {!advancedMode && (
                        <div className="flex items-center justify-center gap-2 bg-slate-50 rounded-lg p-3">
                          {editingQuantityId === item.id && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => { setEditingQuantityId(undefined); setTempQuantity({...tempQuantity, [item.id]: ""}); }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingQuantityId(item.id!);
                              setTempQuantity({...tempQuantity, [item.id]: ((parseInt(tempQuantity[item.id] || "0") || 0) - 1).toString()});
                            }}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            className="w-16 h-8 text-center"
                            placeholder="0"
                            value={tempQuantity[item.id] || ""}
                            onChange={(e) => { setEditingQuantityId(item.id!); setTempQuantity({...tempQuantity, [item.id]: e.target.value}); }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingQuantityId(item.id!);
                              setTempQuantity({...tempQuantity, [item.id]: ((parseInt(tempQuantity[item.id] || "0") || 0) + 1).toString()});
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          {editingQuantityId === item.id && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                const delta = parseInt(tempQuantity[item.id]) || 0;
                                handleQuantityUpdate(item.id!, delta);
                                setEditingQuantityId(undefined);
                                setTempQuantity({...tempQuantity, [item.id]: ""});
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== undefined} onOpenChange={(open) => !open && setDeleteConfirmId(undefined)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>Are you sure you want to delete this item? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(undefined)}>No, Keep It</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirmId) handleDeleteItem(deleteConfirmId); }}>Yes, Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetProductDialog();
            return;
          }
          setIsAddDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingProductId ? "Edit Stock Balances" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {editingProductId
                ? "Update the HT, factory, and office balances for this product. This creates a log-only manual edit entry."
                : "Enter the details of the new product below."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                placeholder="Product name"
                value={editingProductId ? editingProductInfo.name : newProduct.name}
                disabled={!!editingProductId}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                placeholder="Category"
                value={editingProductId ? editingProductInfo.category : newProduct.category}
                disabled={!!editingProductId}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={editingProductId ? "edit-ht-quantity" : "ht-quantity"}>HT Quantity</Label>
                <Input
                  id={editingProductId ? "edit-ht-quantity" : "ht-quantity"}
                  type="number"
                  placeholder="0"
                  min="0"
                  value={editingProductId ? editProductBalances.heatTreatmentQuantity : newProduct.heatTreatmentQuantity}
                  onFocus={selectAllOnFocus}
                  onChange={(e) =>
                    editingProductId
                      ? setEditProductBalances({ ...editProductBalances, heatTreatmentQuantity: e.target.value })
                      : setNewProduct({ ...newProduct, heatTreatmentQuantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={editingProductId ? "edit-fa-quantity" : "fa-quantity"}>FA Quantity</Label>
                <Input
                  id={editingProductId ? "edit-fa-quantity" : "fa-quantity"}
                  type="number"
                  placeholder="0"
                  min="0"
                  value={editingProductId ? editProductBalances.factoryQuantity : newProduct.factoryQuantity}
                  onFocus={selectAllOnFocus}
                  onChange={(e) =>
                    editingProductId
                      ? setEditProductBalances({ ...editProductBalances, factoryQuantity: e.target.value })
                      : setNewProduct({ ...newProduct, factoryQuantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={editingProductId ? "edit-of-quantity" : "of-quantity"}>OF Quantity</Label>
                <Input
                  id={editingProductId ? "edit-of-quantity" : "of-quantity"}
                  type="number"
                  placeholder="0"
                  min="0"
                  value={editingProductId ? editProductBalances.officeQuantity : newProduct.officeQuantity}
                  onFocus={selectAllOnFocus}
                  onChange={(e) =>
                    editingProductId
                      ? setEditProductBalances({ ...editProductBalances, officeQuantity: e.target.value })
                      : setNewProduct({ ...newProduct, officeQuantity: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetProductDialog} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={editingProductId ? handleEditProduct : handleAddProduct} disabled={isSubmitting}>
              {isSubmitting
                ? editingProductId
                  ? "Saving..."
                  : "Adding..."
                : editingProductId
                ? "Save Changes"
                : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Stock Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
            <DialogDescription>Transfer this stock to another location. The target location must have the same product.</DialogDescription>
          </DialogHeader>
          {transferSourceId && (() => {
            const sourceItem = items.find(i => i.id === transferSourceId);
            if (!sourceItem) return null;
            const sourceLocation = sourceItem.locationId ? locations.find(l => l.id === sourceItem.locationId) : null;
            return (
              <div className="grid gap-4 py-4">
                <div className="space-y-2 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs font-semibold text-slate-500">FROM</p>
                  <p className="font-semibold text-slate-900">{capitalize(sourceItem.name)}</p>
                  <p className="text-xs text-slate-600">Location: {sourceLocation ? capitalize(sourceLocation.name) : 'N/A'}</p>
                  <p className="text-xs text-slate-600">Available: <span className="font-semibold">{sourceItem.quantity}</span> units</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-location">Transfer To Location *</Label>
                  <Select value={transferData.targetLocationId} onValueChange={(value) => setTransferData({ ...transferData, targetLocationId: value })}>
                    <SelectTrigger id="target-location"><SelectValue placeholder="Select target location" /></SelectTrigger>
                    <SelectContent>
                      {locations.filter(loc => loc.id !== sourceItem.locationId).map((location) => (
                        <SelectItem key={location.id} value={location.id}>{capitalize(location.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-quantity">Quantity to Transfer *</Label>
                  <Input id="transfer-quantity" type="number" placeholder="0" max={sourceItem.quantity} value={transferData.quantity} onChange={(e) => setTransferData({ ...transferData, quantity: e.target.value })} />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsTransferDialogOpen(false); setTransferSourceId(undefined); setTransferData({ targetLocationId: "", quantity: "" }); }}>Cancel</Button>
            <Button onClick={handleTransferStock}>Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Transaction Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Bulk Transaction</DialogTitle>
            <DialogDescription>Add multiple stock adjustments at once. All changes will be recorded as a single bulk transaction.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 py-2">
            {bulkTransactionRows.map((row, index) => {
              const selectedItem = row.id ? items.find(i => i.id === row.id) : null;
              const isExpanded = expandedRowIndex === index;
              
              return (
                <div key={index}>
                  {/* Collapsed View - Single Line */}
                  {!isExpanded ? (
                    <div 
                      onClick={() => setExpandedRowIndex(index)}
                      className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-3"
                    >
                      <span className="text-xs font-semibold text-slate-600 min-w-fit">Row {index + 1}:</span>
                      <span className="text-xs font-medium text-slate-700 flex-1 min-w-0 truncate">
                        {selectedItem ? capitalize(selectedItem.name) : "Select item"}
                      </span>
                      <span className="text-xs font-bold text-slate-700 flex-shrink-0">
                        {row.quantity ? `${row.quantity}` : "0"} <span className="font-semibold text-slate-600">{row.operation}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBulkRow(index);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    /* Expanded View - Full Details */
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                      {/* Row Header with Delete */}
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedRowIndex(null)}>
                        <span className="text-xs font-semibold text-slate-600">Row {index + 1} (Click to collapse)</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBulkRow(index);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Select Item - Full Width */}
                      <div>
                        <Label className="text-xs mb-1 block font-semibold">Item *</Label>
                        <Select value={row.id} onValueChange={(value) => {
                          const newRows = [...bulkTransactionRows];
                          newRows[index] = { ...row, id: value };
                          setBulkTransactionRows(newRows);
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent className="max-h-[250px]">
                            {sortItems(items).map((item) => (
                              <SelectItem key={item.id} value={item.id} className="text-xs">
                                {capitalize(item.name)} - {item.quantity} units
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quantity and Operation in One Row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs mb-1 block font-semibold">Qty *</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            className="h-8 text-xs"
                            min="0"
                            value={row.quantity}
                            onChange={(e) => {
                              const newRows = [...bulkTransactionRows];
                              newRows[index] = { ...row, quantity: e.target.value };
                              setBulkTransactionRows(newRows);
                            }}
                          />
                        </div>

                        {/* Operation Toggle */}
                        <div>
                          <Label className="text-xs mb-1 block font-semibold">Operation</Label>
                          <div className="flex gap-1 h-8">
                            <Button
                              variant={row.operation === "Add" ? "default" : "outline"}
                              size="sm"
                              className="flex-1 text-xs h-8 px-2"
                              onClick={() => {
                                const newRows = [...bulkTransactionRows];
                                newRows[index] = { ...row, operation: "Add" };
                                setBulkTransactionRows(newRows);
                              }}
                            >
                              Add
                            </Button>
                            <Button
                              variant={row.operation === "Deduct" ? "default" : "outline"}
                              size="sm"
                              className="flex-1 text-xs h-8 px-2"
                              onClick={() => {
                                const newRows = [...bulkTransactionRows];
                                newRows[index] = { ...row, operation: "Deduct" };
                                setBulkTransactionRows(newRows);
                              }}
                            >
                              Less
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Optional Location */}
                      <div>
                        <Label className="text-xs mb-1 block font-semibold text-slate-600">Location (Optional)</Label>
                        <Select value={row.locationId} onValueChange={(value) => {
                          const newRows = [...bulkTransactionRows];
                          newRows[index] = { ...row, locationId: value };
                          setBulkTransactionRows(newRows);
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select location" /></SelectTrigger>
                          <SelectContent>
                            {locations.map((location) => (
                              <SelectItem key={location.id} value={location.id} className="text-xs">
                                {capitalize(location.name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Row Button */}
            <Button
              variant="outline"
              onClick={handleAddBulkRow}
              className="w-full border-dashed text-xs h-8"
            >
              <Plus className="mr-1 h-3 w-3" /> Add Row
            </Button>
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkDialogOpen(false);
                setExpandedRowIndex(null);
                setBulkTransactionRows([{
                  id: "",
                  quantity: "",
                  operation: "Add",
                  locationId: "",
                }]);
              }}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Reject Transaction
            </Button>
            <Button
              onClick={handleBulkTransactionConfirm}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-xs h-9"
            >
              {isSubmitting ? "Processing..." : "Confirm Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales Dialog */}
      <Dialog open={isSalesDialogOpen} onOpenChange={setIsSalesDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Sales</DialogTitle>
            <DialogDescription>Record sales by adding items and selecting the selling company.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sales-date" className="text-sm font-semibold">Date *</Label>
                <Input
                  id="sales-date"
                  type="date"
                  className="h-9"
                  value={salesDate.toISOString().split("T")[0]}
                  onChange={(e) => setSalesDate(new Date(e.target.value))}
                />
              </div>

              <div>
                <Label htmlFor="sales-company" className="text-sm font-semibold">Selling Company *</Label>
                <Select value={selectedSalesCompany} onValueChange={(value: any) => setSelectedSalesCompany(value)}>
                  <SelectTrigger id="sales-company" className="h-9">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CEC">CEC</SelectItem>
                    <SelectItem value="AGW">AGW</SelectItem>
                    <SelectItem value="BRP">BRP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Company Selector */}
            <div>
              <Label htmlFor="sales-remarks" className="text-sm font-semibold">Remarks</Label>
              <Input
                id="sales-remarks"
                className="h-9"
                placeholder="Optional remarks"
                value={salesRemarks}
                onChange={(e) => setSalesRemarks(e.target.value)}
              />
            </div>

            {/* Sales Items */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Items to Sell</Label>
              {salesRows.map((row, index) => {
                const selectedItem = row.id ? items.find(i => i.id === row.id) : null;
                const ofBalance = selectedItem ? ((selectedItem as any).officeBalance || 0) : 0;
                const isExpanded = expandedRowIndex === index;
                
                return (
                  <div key={index}>
                    {/* Collapsed View */}
                    {!isExpanded ? (
                      <div 
                        onClick={() => setExpandedRowIndex(index)}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-3"
                      >
                        <span className="text-xs font-semibold text-slate-600 min-w-fit">Row {index + 1}:</span>
                        <span className="text-xs font-medium text-slate-700 flex-1 min-w-0 truncate">
                          {selectedItem ? capitalize(selectedItem.name) : "Select item"}
                        </span>
                        <span className="text-xs font-bold text-slate-700 flex-shrink-0">
                          {row.quantity ? `${row.quantity}` : "0"} units
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newRows = salesRows.filter((_, i) => i !== index);
                            setSalesRows(newRows.length === 0 ? [{ id: "", quantity: "" }] : newRows);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      /* Expanded View */
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                        {/* Row Header */}
                        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedRowIndex(null)}>
                          <span className="text-xs font-semibold text-slate-600">Row {index + 1} (Click to collapse)</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newRows = salesRows.filter((_, i) => i !== index);
                              setSalesRows(newRows.length === 0 ? [{ id: "", quantity: "" }] : newRows);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Select Item */}
                        <div>
                          <Label className="text-xs mb-1 block font-semibold">Item (Office Balance) *</Label>
                          <SearchableSelect
                            value={row.id}
                            onValueChange={(value) => {
                              const newRows = [...salesRows];
                              newRows[index] = { ...row, id: value };
                              setSalesRows(newRows);
                            }}
                            placeholder="Select item"
                            items={sortItems(items.filter(item => ((item as any).officeBalance || 0) > 0)).map((item) => ({
                              id: item.id,
                              label: `${capitalize(item.name)} (OF: ${((item as any).officeBalance || 0)}) - ${capitalize((item as any).category || '')}`,
                            }))}
                          />
                        </div>

                        {/* Quantity Input */}
                        <div>
                          <Label className="text-xs mb-1 block font-semibold">Quantity *</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            className="h-8 text-xs"
                            min="0"
                            max={ofBalance}
                            value={row.quantity}
                            onChange={(e) => {
                              const newRows = [...salesRows];
                              newRows[index] = { ...row, quantity: e.target.value };
                              setSalesRows(newRows);
                            }}
                          />
                          {selectedItem && (
                            <div className="text-xs text-slate-600 mt-1">
                              Available: <span className="font-semibold">{ofBalance}</span> units
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Row Button */}
              <Button
                variant="outline"
                onClick={() => {
                  setExpandedRowIndex(null);
                  setSalesRows([...salesRows, { id: "", quantity: "" }]);
                }}
                className="w-full border-dashed text-xs h-8"
              >
                <Plus className="mr-1 h-3 w-3" /> Add Row
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setIsSalesDialogOpen(false);
                setExpandedRowIndex(null);
                setSalesRows([{ id: "", quantity: "" }]);
                setSelectedSalesCompany("");
                setSalesDate(new Date());
                setSalesRemarks("");
              }}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSalesConfirm}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-xs h-9"
            >
              {isSubmitting ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
