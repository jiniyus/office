import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const HISTORY_DATA = [
  { id: 1, action: "Restock", item: "MacBook Pro M3", quantity: 15, user: "Demo Admin", date: "Today, 10:23 AM", type: "in" },
  { id: 2, action: "Sale", item: "Dell XPS 15", quantity: 2, user: "Sales System", date: "Today, 09:15 AM", type: "out" },
  { id: 3, action: "Adjustment", item: "Keychron K2", quantity: -1, user: "Demo Admin", date: "Yesterday, 4:45 PM", type: "out" },
  { id: 4, action: "Restock", item: "Logitech MX Master 3", quantity: 50, user: "Warehouse Mgr", date: "Yesterday, 2:30 PM", type: "in" },
  { id: 5, action: "Sale", item: "Samsung 34\" Monitor", quantity: 1, user: "Sales System", date: "Feb 12, 11:20 AM", type: "out" },
  { id: 6, action: "New Item", item: "Office Chair Ergo", quantity: 32, user: "Demo Admin", date: "Feb 10, 09:00 AM", type: "in" },
];

export default function HistoryPage() {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Stock History</h1>
            <p className="text-slate-500 mt-1">Audit log of all inventory movements.</p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search history..."
              className="pl-9 bg-white border-slate-200"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {HISTORY_DATA.map((entry) => (
                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`
                      h-10 w-10 rounded-full flex items-center justify-center border
                      ${entry.type === 'in' 
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                        : 'bg-amber-50 border-amber-100 text-amber-600'}
                    `}>
                      {entry.type === 'in' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {entry.action} <span className="text-slate-400 mx-1">•</span> {entry.item}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-500">
                          {entry.user}
                        </Badge>
                        <span className="flex items-center text-xs text-slate-400">
                          <Clock className="h-3 w-3 mr-1" />
                          {entry.date}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${entry.type === 'in' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {entry.type === 'in' ? '+' : '-'}{Math.abs(entry.quantity)}
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