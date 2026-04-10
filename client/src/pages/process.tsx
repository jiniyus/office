import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, ChevronRight, Calendar, X, Check } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
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
import { useStockItems } from "@/lib/firestore-hooks";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { collection, addDoc, Timestamp, deleteDoc, doc, updateDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { capitalize } from "@/lib/utils";
import { format } from "date-fns";

interface ProcessRow {
  id: string;
  quantity: string;
}

interface ProcessData {
  id: string;
  serialNumber: string;
  date: Date;
  processType: "heat_treatment" | "factory_transfer" | "office_transfer";
  items: Array<{
    itemId: string;
    itemName: string;
    category: string;
    quantity: number;
  }>;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
}

export default function ProcessPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFactoryTransferModalOpen, setIsFactoryTransferModalOpen] = useState(false);
  const [isOfficeTransferModalOpen, setIsOfficeTransferModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<"heat_treatment" | "factory_transfer" | "office_transfer" | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [editingSerialNumber, setEditingSerialNumber] = useState(false);
  const [tempSerialNumber, setTempSerialNumber] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [processItems, setProcessItems] = useState<ProcessRow[]>([{ id: "", quantity: "" }]);
  const [factoryTransferRows, setFactoryTransferRows] = useState<ProcessRow[]>([{ id: "", quantity: "" }]);
  const [officeTransferRows, setOfficeTransferRows] = useState<ProcessRow[]>([{ id: "", quantity: "" }]);
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);
  const [processes, setProcesses] = useState<ProcessData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [serialCounter, setSerialCounter] = useState(1);

  const { items, loading } = useStockItems();
  const { user } = useAuth();
  const { toast } = useToast();

  // Load processes from Firestore on component mount
  useEffect(() => {
    const loadProcesses = async () => {
      try {
        const q = query(collection(db, "processes"));
        const querySnapshot = await getDocs(q);
        const loadedProcesses = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            serialNumber: data.serialNumber,
            date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
            processType: data.processType,
            items: data.items,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
            createdBy: data.createdBy,
          } as ProcessData;
        });
        
        // Sort by creation date (newest first)
        loadedProcesses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setProcesses(loadedProcesses);

        // Calculate next serial number
        if (loadedProcesses.length > 0) {
          const maxSerialNumber = Math.max(...loadedProcesses.map(p => parseInt(p.serialNumber) || 0));
          setSerialCounter(maxSerialNumber + 1);
        }
      } catch (error) {
        console.error("Error loading processes:", error);
      }
    };

    loadProcesses();
  }, []);

  // Generate serial number when modal opens
  const handleProcessClick = (processType: "heat_treatment" | "factory_transfer" | "office_transfer") => {
    if (processType === "factory_transfer") {
      setFactoryTransferRows([{ id: "", quantity: "" }]);
      setIsFactoryTransferModalOpen(true);
    } else if (processType === "office_transfer") {
      setOfficeTransferRows([{ id: "", quantity: "" }]);
      setIsOfficeTransferModalOpen(true);
    } else {
      // Heat treatment
      setSelectedProcess(processType);
      setSerialNumber(serialCounter.toString());
      setTempSerialNumber(serialCounter.toString());
      setEditingSerialNumber(false);
      setSelectedDate(new Date());
      setProcessItems([{ id: "", quantity: "" }]);
      setExpandedRowIndex(0);
      setIsModalOpen(true);
    }
  };

  const handleAddRow = () => {
    setProcessItems([...processItems, { id: "", quantity: "" }]);
    setExpandedRowIndex(processItems.length);
  };

  const handleRemoveRow = (index: number) => {
    const newItems = processItems.filter((_, i) => i !== index);
    setProcessItems(newItems);
    setExpandedRowIndex(null);
  };

  const handleConfirmProcess = async () => {
    // Validate rows
    for (let i = 0; i < processItems.length; i++) {
      const row = processItems[i];
      if (!row.id || !row.quantity) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Please select item and quantity`,
        });
        return;
      }
      const qty = parseInt(row.quantity);
      if (qty <= 0) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Quantity must be greater than 0`,
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const processedItems = processItems.map(row => {
        const item = items.find(it => it.id === row.id)!;
        return {
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          quantity: parseInt(row.quantity),
        };
      });

      // Save to Firestore
      const docRef = await addDoc(collection(db, "processes"), {
        serialNumber: serialNumber,
        date: Timestamp.fromDate(selectedDate),
        processType: selectedProcess!,
        items: processedItems,
        createdAt: Timestamp.now(),
        createdBy: {
          id: user?.uid || "",
          name: user?.displayName || "Unknown",
        },
      });

      const newProcess: ProcessData = {
        id: docRef.id,
        serialNumber: serialNumber,
        date: selectedDate,
        processType: selectedProcess!,
        items: processedItems,
        createdAt: new Date(),
        createdBy: {
          id: user?.uid || "",
          name: user?.displayName || "Unknown",
        },
      };

      // Update stock items and create history entries for each item in the process
      for (const item of processedItems) {
        const stockItem = items.find(si => si.id === item.itemId);
        if (!stockItem) continue;

        // Determine which balance field to update based on process type
        const balanceFieldMap: Record<string, string> = {
          heat_treatment: "heatTreatmentBalance",
          factory_transfer: "factoryBalance",
          office_transfer: "officeBalance",
        };
        const balanceField = balanceFieldMap[selectedProcess!];
        
        // Get current balance for this location
        const currentBalance = (stockItem as any)[balanceField] || 0;
        const newBalance = currentBalance + item.quantity;

        // Update stock item with new balance
        const stockItemRef = doc(db, "stock-items", item.itemId);
        
        // Calculate total quantity as sum of all balances
        const allBalances = {
          heat_treatment: selectedProcess === 'heat_treatment' ? newBalance : (stockItem as any).heatTreatmentBalance || 0,
          factory_transfer: selectedProcess === 'factory_transfer' ? newBalance : (stockItem as any).factoryBalance || 0,
          office_transfer: selectedProcess === 'office_transfer' ? newBalance : (stockItem as any).officeBalance || 0,
        };
        const totalQty = allBalances.heat_treatment + allBalances.factory_transfer + allBalances.office_transfer;
        
        await updateDoc(stockItemRef, {
          [balanceField]: newBalance,
          quantity: totalQty,
          lastUpdated: Timestamp.now(),
        });

        // Create history log entry for this item
        const historyType = `${selectedProcess}_created`;
        await addDoc(collection(db, "transactions"), {
          itemId: item.itemName,
          category: item.category,
          company: user?.company || "",
          quantityChange: item.quantity,
          previousBalance: currentBalance,
          balance: newBalance,
          locationId: null,
          timestamp: Timestamp.now(),
          type: historyType as any,
          processId: docRef.id,
          user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
        });
      }

      // Update local state
      setProcesses([newProcess, ...processes]);
      
      // Only increment counter after successful save
      setSerialCounter(serialCounter + 1);

      toast({
        title: "Success",
        description: `${capitalize(selectedProcess!.replace("_", " "))} process created successfully`,
      });

      setIsModalOpen(false);
      setSelectedProcess(null);
      setProcessItems([{ id: "", quantity: "" }]);
    } catch (error) {
      console.error("Error creating process:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create process",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProcess = async (processId: string) => {
    try {
      // Find the process to get its details
      const processToDelete = processes.find(p => p.id === processId);
      if (!processToDelete) return;

      // Revert stock balances for each item in the process
      for (const item of processToDelete.items) {
        const stockItem = items.find(si => si.id === item.itemId);
        if (!stockItem) continue;

        // Determine which balance field to revert based on process type
        const balanceFieldMap: Record<string, string> = {
          heat_treatment: "heatTreatmentBalance",
          factory_transfer: "factoryBalance",
          office_transfer: "officeBalance",
        };
        const balanceField = balanceFieldMap[processToDelete.processType];
        
        // Get current balance and revert
        const currentBalance = (stockItem as any)[balanceField] || 0;
        const revertedBalance = Math.max(0, currentBalance - item.quantity);

        // Calculate new total quantity
        const allBalances = {
          heat_treatment: processToDelete.processType === 'heat_treatment' ? revertedBalance : (stockItem as any).heatTreatmentBalance || 0,
          factory_transfer: processToDelete.processType === 'factory_transfer' ? revertedBalance : (stockItem as any).factoryBalance || 0,
          office_transfer: processToDelete.processType === 'office_transfer' ? revertedBalance : (stockItem as any).officeBalance || 0,
        };
        const totalQty = allBalances.heat_treatment + allBalances.factory_transfer + allBalances.office_transfer;

        // Update stock item with reverted balance
        const stockItemRef = doc(db, "stock-items", item.itemId);
        await updateDoc(stockItemRef, {
          [balanceField]: revertedBalance,
          quantity: totalQty,
          lastUpdated: Timestamp.now(),
        });
      }

      // Delete the process
      await deleteDoc(doc(db, "processes", processId));
      setProcesses(processes.filter(p => p.id !== processId));
      toast({
        title: "Success",
        description: "Process deleted and changes reverted",
      });
    } catch (error) {
      console.error("Error deleting process:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete process",
      });
    }
  };

  const handleFactoryTransferConfirm = async () => {
    // Validate rows
    for (let i = 0; i < factoryTransferRows.length; i++) {
      const row = factoryTransferRows[i];
      if (!row.id || !row.quantity) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Please select item and quantity`,
        });
        return;
      }
      const qty = parseInt(row.quantity);
      if (qty <= 0) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Quantity must be greater than 0`,
        });
        return;
      }
      const item = items.find(it => it.id === row.id);
      if (!item) continue;
      const htBalance = (item as any).heatTreatmentBalance || 0;
      if (qty > htBalance) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Cannot transfer more than available HT balance (${htBalance})`,
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      for (const row of factoryTransferRows) {
        const item = items.find(it => it.id === row.id);
        if (!item) continue;

        const qty = parseInt(row.quantity);
        const htBalance = (item as any).heatTreatmentBalance || 0;
        const faBalance = (item as any).factoryBalance || 0;
        const ofBalance = (item as any).officeBalance || 0;

        const newHTBalance = htBalance - qty;
        const newFABalance = faBalance + qty;

        const stockItemRef = doc(db, "stock-items", item.id);
        await updateDoc(stockItemRef, {
          heatTreatmentBalance: newHTBalance,
          factoryBalance: newFABalance,
          quantity: newHTBalance + newFABalance + ofBalance,
          lastUpdated: Timestamp.now(),
        });

        // Record transaction
        await addDoc(collection(db, "transactions"), {
          itemId: item.name,
          category: item.category,
          company: user?.company || "",
          quantityChange: qty,
          previousBalance: htBalance,
          balance: newHTBalance,
          locationId: null,
          timestamp: Timestamp.now(),
          type: 'factory_transfer_created',
          user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
        });
      }

      toast({
        title: "Success",
        description: `Transferred ${factoryTransferRows.length} items to factory`,
      });

      setIsFactoryTransferModalOpen(false);
      setFactoryTransferRows([{ id: "", quantity: "" }]);
    } catch (error) {
      console.error("Error transferring to factory:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to transfer to factory",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfficeTransferConfirm = async () => {
    // Validate rows
    for (let i = 0; i < officeTransferRows.length; i++) {
      const row = officeTransferRows[i];
      if (!row.id || !row.quantity) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Please select item and quantity`,
        });
        return;
      }
      const qty = parseInt(row.quantity);
      if (qty <= 0) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Quantity must be greater than 0`,
        });
        return;
      }
      const item = items.find(it => it.id === row.id);
      if (!item) continue;
      const faBalance = (item as any).factoryBalance || 0;
      if (qty > faBalance) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Row ${i + 1}: Cannot transfer more than available FA balance (${faBalance})`,
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      for (const row of officeTransferRows) {
        const item = items.find(it => it.id === row.id);
        if (!item) continue;

        const qty = parseInt(row.quantity);
        const htBalance = (item as any).heatTreatmentBalance || 0;
        const faBalance = (item as any).factoryBalance || 0;
        const ofBalance = (item as any).officeBalance || 0;

        const newFABalance = faBalance - qty;
        const newOFBalance = ofBalance + qty;

        const stockItemRef = doc(db, "stock-items", item.id);
        await updateDoc(stockItemRef, {
          factoryBalance: newFABalance,
          officeBalance: newOFBalance,
          quantity: htBalance + newFABalance + newOFBalance,
          lastUpdated: Timestamp.now(),
        });

        // Record transaction
        await addDoc(collection(db, "transactions"), {
          itemId: item.name,
          category: item.category,
          company: user?.company || "",
          quantityChange: qty,
          previousBalance: faBalance,
          balance: newFABalance,
          locationId: null,
          timestamp: Timestamp.now(),
          type: 'office_transfer_created',
          user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
        });
      }

      toast({
        title: "Success",
        description: `Transferred ${officeTransferRows.length} items to office`,
      });

      setIsOfficeTransferModalOpen(false);
      setOfficeTransferRows([{ id: "", quantity: "" }]);
    } catch (error) {
      console.error("Error transferring to office:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to transfer to office",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const processTypeColors: { [key: string]: { bg: string; text: string; label: string } } = {
    heat_treatment: { bg: "bg-orange-600 hover:bg-orange-700", text: "text-white", label: "Create Heat Treatment" },
    factory_transfer: { bg: "bg-blue-600 hover:bg-blue-700", text: "text-white", label: "Transfer to Factory" },
    office_transfer: { bg: "bg-green-600 hover:bg-green-700", text: "text-white", label: "Transfer to Office" },
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
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Process Management</h1>
          <p className="text-slate-500 mt-1">Create and manage stock processing workflows.</p>
        </div>

        {/* Action Buttons */}
        <div className="grid gap-3">
          {Object.entries(processTypeColors).map(([processType, colors]) => (
            <Button
              key={processType}
              className={`${colors.bg} ${colors.text} h-14 w-full text-lg font-semibold shadow-lg`}
              onClick={() => handleProcessClick(processType as "heat_treatment" | "factory_transfer" | "office_transfer")}
            >
              {colors.label}
            </Button>
          ))}
        </div>

        {/* Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
        </div>

        {/* Process Blocks */}
        {processes.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-8 text-center text-slate-500">
              No processes created yet
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {processes.map((process) => (
              <Card key={process.id} className="border-slate-200 shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            process.processType === "heat_treatment"
                              ? "bg-orange-100 text-orange-700"
                              : process.processType === "factory_transfer"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          }
                        >
                          {capitalize(process.processType.replace("_", " "))}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-700">
                          {process.serialNumber}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-sm text-slate-600">
                        <span>Date: <span className="font-semibold">{format(process.date, "MMM dd, yyyy")}</span></span>
                        <span>By: <span className="font-semibold">{process.createdBy.name}</span></span>
                        <span className="text-xs text-slate-500">
                          {process.items.length} item{process.items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteProcess(process.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-lg">
                    {process.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">{capitalize(item.itemName)}</p>
                          <p className="text-xs text-slate-600">{item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">{item.quantity} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Process Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedProcess && capitalize(selectedProcess.replace("_", " "))}
            </DialogTitle>
            <DialogDescription>
              Add items to this process
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Serial Number and Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block font-semibold">Serial Number {!editingSerialNumber && <span className="text-slate-500">(click to edit)</span>}</Label>
                {editingSerialNumber ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={tempSerialNumber}
                      onChange={(e) => setTempSerialNumber(e.target.value)}
                      className="h-8 text-xs flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        setSerialNumber(tempSerialNumber);
                        setEditingSerialNumber(false);
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      onClick={() => {
                        setTempSerialNumber(serialNumber);
                        setEditingSerialNumber(false);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Input
                    value={serialNumber}
                    onClick={() => {
                      setTempSerialNumber(serialNumber);
                      setEditingSerialNumber(true);
                    }}
                    className="h-8 text-xs bg-slate-50 border-slate-200 cursor-pointer hover:bg-slate-100"
                    readOnly
                  />
                )}
              </div>
              <div>
                <Label className="text-xs mb-1 block font-semibold cursor-pointer">
                  Date <span className="text-slate-500">(click to change)</span>
                </Label>
                <Input
                  type="date"
                  value={format(selectedDate, "yyyy-MM-dd")}
                  onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  className="h-8 text-xs border-slate-200"
                />
              </div>
            </div>

            {/* Items Rows */}
            <div>
              <Label className="text-xs mb-2 block font-semibold">Items</Label>
              <div className="space-y-2">
                {processItems.map((row, index) => {
                  const selectedItem = row.id ? items.find(i => i.id === row.id) : null;
                  const isExpanded = expandedRowIndex === index;

                  return (
                    <div key={index}>
                      {!isExpanded ? (
                        <div
                          onClick={() => setExpandedRowIndex(index)}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-2"
                        >
                          <span className="text-xs font-semibold text-slate-600 min-w-fit">
                            Row {index + 1}:
                          </span>
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
                              handleRemoveRow(index);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                          {/* Row Header */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Row {index + 1} (Click to collapse)
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleRemoveRow(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Select Item and Quantity - One Line */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <Label className="text-xs mb-1 block font-semibold">Item *</Label>
                              <Select
                                value={row.id}
                                onValueChange={(value) => {
                                  const newItems = [...processItems];
                                  newItems[index] = { ...row, id: value };
                                  setProcessItems(newItems);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select item" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[250px]">
                                  {items.map((item) => (
                                    <SelectItem key={item.id} value={item.id} className="text-xs">
                                      {capitalize(item.name)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs mb-1 block font-semibold">Qty *</Label>
                              <Input
                                type="number"
                                placeholder="0"
                                className="h-8 text-xs"
                                min="0"
                                max={selectedItem?.quantity || 999}
                                value={row.quantity}
                                onChange={(e) => {
                                  const newItems = [...processItems];
                                  newItems[index] = { ...row, quantity: e.target.value };
                                  setProcessItems(newItems);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Row Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-xs h-8"
                onClick={handleAddRow}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Reject
            </Button>
            <Button
              onClick={handleConfirmProcess}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-xs h-9"
            >
              {isSubmitting ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Factory Transfer Modal */}
      <Dialog open={isFactoryTransferModalOpen} onOpenChange={setIsFactoryTransferModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Transfer to Factory</DialogTitle>
            <DialogDescription>Transfer items from Heat Treatment to Factory location</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
            {factoryTransferRows.map((row, index) => {
              const selectedItem = items.find(i => i.id === row.id);
              const htBalance = selectedItem ? ((selectedItem as any).heatTreatmentBalance || 0) : 0;
              return (
                <div
                  key={index}
                  className={`p-3 rounded-lg border transition-colors ${
                    index === expandedRowIndex
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100"
                  }`}
                  onClick={() => setExpandedRowIndex(index === expandedRowIndex ? null : index)}
                >
                  {index === expandedRowIndex ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor={`factory-item-${index}`}>Select Item</Label>
                        <Select
                          value={row.id}
                          onValueChange={(itemId) => {
                            const newRows = [...factoryTransferRows];
                            newRows[index].id = itemId;
                            setFactoryTransferRows(newRows);
                          }}
                        >
                          <SelectTrigger id={`factory-item-${index}`}>
                            <SelectValue placeholder="Choose item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.filter(item => ((item as any).heatTreatmentBalance || 0) > 0).map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {capitalize(item.name)} - {capitalize(item.category)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedItem && (
                        <>
                          <div className="p-2 bg-blue-100 rounded text-sm text-blue-700 font-semibold">
                            Available HT Balance: {htBalance} units
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`factory-qty-${index}`}>Quantity</Label>
                            <Input
                              id={`factory-qty-${index}`}
                              type="number"
                              placeholder="0"
                              max={htBalance}
                              value={row.quantity}
                              onChange={(e) => {
                                const newRows = [...factoryTransferRows];
                                newRows[index].quantity = e.target.value;
                                setFactoryTransferRows(newRows);
                              }}
                            />
                          </div>
                        </>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const newRows = factoryTransferRows.filter((_, i) => i !== index);
                          setFactoryTransferRows(newRows.length === 0 ? [{ id: "", quantity: "" }] : newRows);
                        }}
                        className="w-full text-xs"
                      >
                        Remove Row
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600">Row {index + 1}:</span>
                      <span className="text-xs font-medium text-slate-700">
                        {selectedItem ? capitalize(selectedItem.name) : "Select item"}
                      </span>
                      <span className="text-xs font-bold text-slate-700">{row.quantity ? `${row.quantity}` : "0"} units</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFactoryTransferRows([...factoryTransferRows, { id: "", quantity: "" }])}
              className="text-xs h-9"
            >
              + Add Row
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFactoryTransferModalOpen(false)}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFactoryTransferConfirm}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-xs h-9"
            >
              {isSubmitting ? "Processing..." : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Office Transfer Modal */}
      <Dialog open={isOfficeTransferModalOpen} onOpenChange={setIsOfficeTransferModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Transfer to Office</DialogTitle>
            <DialogDescription>Transfer items from Factory to Office location</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
            {officeTransferRows.map((row, index) => {
              const selectedItem = items.find(i => i.id === row.id);
              const faBalance = selectedItem ? ((selectedItem as any).factoryBalance || 0) : 0;
              return (
                <div
                  key={index}
                  className={`p-3 rounded-lg border transition-colors ${
                    index === expandedRowIndex
                      ? "border-green-200 bg-green-50"
                      : "border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100"
                  }`}
                  onClick={() => setExpandedRowIndex(index === expandedRowIndex ? null : index)}
                >
                  {index === expandedRowIndex ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor={`office-item-${index}`}>Select Item</Label>
                        <Select
                          value={row.id}
                          onValueChange={(itemId) => {
                            const newRows = [...officeTransferRows];
                            newRows[index].id = itemId;
                            setOfficeTransferRows(newRows);
                          }}
                        >
                          <SelectTrigger id={`office-item-${index}`}>
                            <SelectValue placeholder="Choose item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.filter(item => ((item as any).factoryBalance || 0) > 0).map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {capitalize(item.name)} - {capitalize(item.category)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedItem && (
                        <>
                          <div className="p-2 bg-green-100 rounded text-sm text-green-700 font-semibold">
                            Available FA Balance: {faBalance} units
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`office-qty-${index}`}>Quantity</Label>
                            <Input
                              id={`office-qty-${index}`}
                              type="number"
                              placeholder="0"
                              max={faBalance}
                              value={row.quantity}
                              onChange={(e) => {
                                const newRows = [...officeTransferRows];
                                newRows[index].quantity = e.target.value;
                                setOfficeTransferRows(newRows);
                              }}
                            />
                          </div>
                        </>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const newRows = officeTransferRows.filter((_, i) => i !== index);
                          setOfficeTransferRows(newRows.length === 0 ? [{ id: "", quantity: "" }] : newRows);
                        }}
                        className="w-full text-xs"
                      >
                        Remove Row
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600">Row {index + 1}:</span>
                      <span className="text-xs font-medium text-slate-700">
                        {selectedItem ? capitalize(selectedItem.name) : "Select item"}
                      </span>
                      <span className="text-xs font-bold text-slate-700">{row.quantity ? `${row.quantity}` : "0"} units</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOfficeTransferRows([...officeTransferRows, { id: "", quantity: "" }])}
              className="text-xs h-9"
            >
              + Add Row
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOfficeTransferModalOpen(false)}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleOfficeTransferConfirm}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-xs h-9"
            >
              {isSubmitting ? "Processing..." : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
