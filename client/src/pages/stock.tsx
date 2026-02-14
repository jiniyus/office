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
import { Plus, Search, Filter, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useState, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStockItems } from "@/lib/firestore-hooks";
import { Spinner } from "@/components/ui/spinner";

export default function Stock() {
  const [searchTerm, setSearchTerm] = useState("");
  const { items, loading } = useStockItems();

  // Filter items based on search
  const filteredInventory = useMemo(() => {
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventory Stock</h1>
            <p className="text-slate-500 mt-1">Manage your products and view real-time stock levels.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-10">
              <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
            <Button className="h-10 shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-slate-500">Active inventory items</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Quantity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{items.reduce((sum, item) => sum + item.quantity, 0)}</div>
              <p className="text-xs text-slate-500">Units in stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Low Stock Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.lowStockItems}</div>
              <p className="text-xs text-slate-500">Requires attention</p>
            </CardContent>
          </Card>
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
                        <TableCell className="font-semibold text-slate-900">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal text-slate-600">
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-600">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{item.size || 'N/A'}</TableCell>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Edit details</DropdownMenuItem>
                              <DropdownMenuItem>Update stock</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">Delete item</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{item.id.slice(0, 12)} • {item.category}</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit details</DropdownMenuItem>
                          <DropdownMenuItem>Update stock</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Delete item</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex flex-col">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Quantity</span>
                        <span className="font-mono text-slate-700">{item.quantity} units</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Size</span>
                        <span className="font-mono text-slate-700">{item.size || 'N/A'}</span>
                      </div>
                    </div>

                    <div>
                      <Badge 
                        variant="outline" 
                        className={`w-full justify-center py-1
                          ${status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                          ${status === 'Low Stock' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                          ${status === 'Out of Stock' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                        `}
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}