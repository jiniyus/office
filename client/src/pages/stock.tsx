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
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock Data
const INVENTORY = [
  { id: "STK-001", name: "MacBook Pro M3", category: "Electronics", quantity: 45, price: 1299.00, status: "In Stock" },
  { id: "STK-002", name: "Dell XPS 15", category: "Electronics", quantity: 12, price: 999.00, status: "Low Stock" },
  { id: "STK-003", name: "Logitech MX Master 3", category: "Accessories", quantity: 150, price: 99.00, status: "In Stock" },
  { id: "STK-004", name: "Keychron K2", category: "Accessories", quantity: 0, price: 89.00, status: "Out of Stock" },
  { id: "STK-005", name: "Samsung 34\" Monitor", category: "Electronics", quantity: 8, price: 450.00, status: "Low Stock" },
  { id: "STK-006", name: "Office Chair Ergo", category: "Furniture", quantity: 32, price: 299.00, status: "In Stock" },
  { id: "STK-007", name: "Standing Desk", category: "Furniture", quantity: 5, price: 550.00, status: "Low Stock" },
];

export default function Stock() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredInventory = INVENTORY.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <div className="text-2xl font-bold">2,345</div>
              <p className="text-xs text-emerald-600 font-medium">+12% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$534,231</div>
              <p className="text-xs text-emerald-600 font-medium">+4% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Low Stock Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">12</div>
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
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 group">
                      <TableCell className="font-medium text-slate-600">{item.id}</TableCell>
                      <TableCell className="font-semibold text-slate-900">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-slate-600">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-600">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono font-medium">${item.price.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`
                            ${item.status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                            ${item.status === 'Low Stock' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                            ${item.status === 'Out of Stock' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                          `}
                        >
                          {item.status}
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
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredInventory.map((item) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{item.id} • {item.category}</div>
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
                      <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Price</span>
                      <span className="font-mono text-slate-700">${item.price.toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <Badge 
                      variant="outline" 
                      className={`w-full justify-center py-1
                        ${item.status === 'In Stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                        ${item.status === 'Low Stock' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                        ${item.status === 'Out of Stock' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                      `}
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}