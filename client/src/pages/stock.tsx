import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Filter, ArrowUpDown, Trash2, Minus, Check, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useStockItems } from "@/lib/firestore-hooks";
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [editingQuantityId, setEditingQuantityId] = useState<string | undefined>(undefined);
  const [tempQuantity, setTempQuantity] = useState<{[key: string]: string}>({});
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    quantity: "",
    size: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { items, loading } = useStockItems();
  const { user } = useAuth();
  const { toast } = useToast();

  // Get unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map(item => item.category)));
    return cats.sort();
  }, [items]);

  // Filter items based on search and category
  const filteredInventory = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategories.length === 0 || 
        selectedCategories.includes(item.category);
      
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, selectedCategories]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = items.length;
    const lowStockItems = items.filter(item => item.quantity > 0 && item.quantity <= 10).length;
    
    return {
      totalProducts,
      lowStockItems
    };
  }, [items]);

  // Get status based on quantity
  const getStatus = (quantity: number) => {
    if (quantity === 0) return "Out of Stock";
    if (quantity <= 10) return "Low Stock";
    return "In Stock";
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleQuantityUpdate = async (itemId: string, delta: number) => {
    if (delta === 0) return;
    
    try {
      const itemRef = doc(db, "stock-items", itemId);
      const currentItem = items.find(i => i.id === itemId);
      if (!currentItem) return;
      
      const previousQty = currentItem.quantity;
      const newQty = Math.max(0, previousQty + delta);
      
      // Update stock item
      await updateDoc(itemRef, {
        quantity: newQty,
        lastUpdated: Timestamp.now()
      });
      
      // Create transaction record
      await addDoc(collection(db, "transactions"), {
        itemId: currentItem.name,
        category: currentItem.category,
        company: user?.company || "",
        quantityChange: delta,
        previousBalance: previousQty,
        balance: newQty,
        timestamp: Timestamp.now(),
        user: {
          id: user?.uid || "",
          name: user?.displayName || "Unknown"
        }
      });
      
      toast({
        title: "Success",
        description: `Quantity updated by ${delta > 0 ? '+' : ''}${delta}`,
      });
    } catch (error) {
      console.error("Error updating quantity:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update quantity",
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, "stock-items", itemId));
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
      setDeleteConfirmId(undefined);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete item",
      });
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.category || !newProduct.quantity) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const initialQuantity = parseInt(newProduct.quantity);
      
      await addDoc(collection(db, "stock-items"), {
        name: newProduct.name,
        category: newProduct.category,
        quantity: initialQuantity,
        size: newProduct.size || null,
        company: user?.company || "",
        createdAt: Timestamp.now(),
        createdBy: user?.email || "",
      });

      // Create transaction record for stock item creation
      await addDoc(collection(db, "transactions"), {
        itemId: newProduct.name,
        category: newProduct.category,
        company: user?.company || "",
        quantityChange: initialQuantity,
        previousBalance: 0,
        balance: initialQuantity,
        timestamp: Timestamp.now(),
        type: 'creation',
        user: {
          id: user?.uid || "",
          name: user?.displayName || "Unknown"
        }
      });

      toast({
        title: "Success",
        description: "Product added successfully",
      });

      setNewProduct({ name: "", category: "", quantity: "", size: "" });
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add product",
      });
    } finally {
      setIsSubmitting(false);
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
      <div className="flex flex-col gap-8">
        {/* Header Section */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventory Stock</h1>
            <p className="text-slate-500 mt-1">Manage your products and view real-time stock levels.</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Button 
              className="flex-1 h-10 shadow-lg shadow-primary/20"
              onClick={() => setIsAddDialogOpen(true)}
              disabled={isViewOnly}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Stock View</span>
              <Switch checked={isViewOnly} onCheckedChange={setIsViewOnly} />
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {/* Toolbar */}
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

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-slate-50/50">
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">
                      <Button variant="ghost" size="sm" className="-mr-3 h-8 data-[state=open]:bg-accent">
                        Quantity
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => {
                    const status = getStatus(item.quantity);
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50 group">
                        <TableCell className="font-medium text-slate-600">{item.id.slice(0, 12)}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{capitalize(item.name)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal text-slate-600">
                            {capitalize(item.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{capitalize(item.size || '') || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`
                              ${status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                              ${status === 'Low Stock' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                              ${status === 'Out of Stock' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                            `}
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeleteConfirmId(item.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredInventory.map((item) => {
                const status = getStatus(item.quantity);
                return isViewOnly ? (
                  // Simplified View-Only Mode
                  <div key={item.id} className="p-3 space-y-1">
                    <div>
                      <div className="font-bold text-slate-900 text-base">{capitalize(item.name)}</div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-700">{capitalize(item.category)}</p>
                      </div>
                      <div className="bg-blue-600 text-white rounded font-bold px-3 py-1 min-w-max flex items-center justify-center">
                        {item.quantity}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Full Edit Mode
                  <div key={item.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-slate-900 text-lg">{capitalize(item.name)}</div>
                        <div className="text-sm text-slate-600 mt-1 font-medium">{capitalize(item.category)}</div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteConfirmId(item.id!)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

                    <div className="flex items-center justify-center gap-2 bg-slate-50 rounded-lg p-3">
                      {editingQuantityId === item.id && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setEditingQuantityId(undefined);
                            setTempQuantity({...tempQuantity, [item.id]: ""});
                          }}
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
                        onChange={(e) => {
                          setEditingQuantityId(item.id!);
                          setTempQuantity({...tempQuantity, [item.id]: e.target.value});
                        }}
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
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== undefined} onOpenChange={(open) => !open && setDeleteConfirmId(undefined)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(undefined)}
            >
              No, Keep It
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  handleDeleteItem(deleteConfirmId);
                }
              }}
            >
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>
              Enter the details of the new product below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                placeholder="Product name"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  placeholder="Category"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  placeholder="0"
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Size (Optional)</Label>
              <Input
                id="size"
                placeholder="Size"
                value={newProduct.size}
                onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddProduct} disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}