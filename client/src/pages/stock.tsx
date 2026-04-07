import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Trash2, Minus, Check, X, ArrowRightLeft, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import { useStockItems, useLocations } from "@/lib/firestore-hooks";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { collection, addDoc, Timestamp, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { capitalize } from "@/lib/utils";

export default function Stock() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | undefined>(undefined);
  const [transferData, setTransferData] = useState({
    targetLocationId: "",
    quantity: "",
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [editingQuantityId, setEditingQuantityId] = useState<string | undefined>(undefined);
  const [tempQuantity, setTempQuantity] = useState<{[key: string]: string}>({});
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
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
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    quantity: "",
    size: "",
    locationId: "",
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
  
  const { items, loading } = useStockItems();
  const { locations } = useLocations();
  const { user } = useAuth();
  const { toast } = useToast();

  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map(item => item.category)));
    return cats.sort();
  }, [items]);

  const filteredInventory = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategories.length === 0 || 
        selectedCategories.includes(item.category);
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, searchTerm, selectedCategories]);

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
      const initialQuantity = parseInt(newProduct.quantity) || 0;
      const trimmedName = newProduct.name.trim();
      const trimmedCategory = newProduct.category.trim();
      const trimmedSize = newProduct.size.trim() || null;
      await addDoc(collection(db, "stock-items"), {
        name: trimmedName,
        category: trimmedCategory,
        quantity: initialQuantity,
        size: trimmedSize,
        locationId: newProduct.locationId || null,
        company: user?.company || "",
        createdAt: Timestamp.now(),
        createdBy: user?.email || "",
      });
      await addDoc(collection(db, "transactions"), {
        itemId: newProduct.name,
        category: newProduct.category,
        company: user?.company || "",
        quantityChange: initialQuantity,
        previousBalance: 0,
        balance: initialQuantity,
        locationId: newProduct.locationId || null,
        timestamp: Timestamp.now(),
        type: 'creation',
        user: { id: user?.uid || "", name: user?.displayName || "Unknown" }
      });
      toast({ title: "Success", description: "Product added successfully" });
      setNewProduct({ name: "", category: "", quantity: "", size: "", locationId: "" });
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add product" });
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
                onClick={() => setIsAddDialogOpen(true)}
                disabled={isViewOnly}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-semibold text-slate-700">Stock View</span>
                <Switch checked={isViewOnly} onCheckedChange={setIsViewOnly} />
              </div>
            </div>
            {advancedMode && (
              <Button
                className="w-full h-10 shadow-lg shadow-purple-600/20 bg-purple-600 hover:bg-purple-700"
                onClick={() => setIsBulkDialogOpen(true)}
                disabled={isViewOnly}
              >
                <Zap className="mr-2 h-4 w-4" /> Bulk Transaction
              </Button>
            )}
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {/* Search Bar */}
            <div className="flex items-center p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  className="pl-9 bg-white border-slate-200 focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Unified Card View — same on mobile and desktop */}
            <div className="divide-y divide-slate-100">
              {filteredInventory.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No products found</div>
              ) : (
                filteredInventory.map((item) => {
                  const location = item.locationId ? locations.find(l => l.id === item.locationId) : null;
                  return isViewOnly ? (
                    // View Only Mode
                    <div key={item.id} className="p-3 space-y-1">
                      <div className="font-bold text-slate-900 text-base">{capitalize(item.name)}</div>
                      <div className="flex items-center gap-8">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-700">{capitalize(item.category)}</p>
                          <p className="text-xs font-semibold text-slate-700 mt-1">Location: {location ? capitalize(location.name) : 'N/A'}</p>
                        </div>
                        <div className="bg-blue-600 text-white rounded font-bold px-3 py-1 min-w-max flex items-center justify-center">
                          {item.quantity}
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
                          <div className="text-xs font-semibold text-slate-700 mt-1">Location: {location ? capitalize(location.name) : 'N/A'}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => { setTransferSourceId(item.id!); setIsTransferDialogOpen(true); }}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
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
                          <span className="text-slate-500 text-xs uppercase tracking-wider font-bold">Size</span>
                          <span className="text-slate-500 text-xs uppercase tracking-wider font-bold">Quantity</span>
                        </div>
                        <div className="flex items-end justify-between gap-4">
                          <span className="font-mono text-slate-700 font-bold">{capitalize(item.size || '') || 'N/A'}</span>
                          <div className="bg-blue-600 text-white rounded font-bold px-3 py-1 min-w-max flex items-center justify-center">
                            {item.quantity}
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
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>Enter the details of the new product below.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" placeholder="Product name" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input id="category" placeholder="Category" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity (Optional)</Label>
                <Input id="quantity" type="number" placeholder="0" min="0" value={newProduct.quantity} onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Size (Optional)</Label>
              <Input id="size" placeholder="Size" value={newProduct.size} onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Select value={newProduct.locationId} onValueChange={(value) => setNewProduct({ ...newProduct, locationId: value })}>
                <SelectTrigger id="location"><SelectValue placeholder="Select a location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{capitalize(location.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleAddProduct} disabled={isSubmitting}>{isSubmitting ? "Adding..." : "Add Product"}</Button>
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
          
          <div className="space-y-2 py-4">
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
                        {bulkTransactionRows.length > 1 && (
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
                        )}
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
                            {items.map((item) => (
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
    </Layout>
  );
}