import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTransactions } from "@/lib/firestore-hooks";
import { useState, useMemo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatDistanceToNow } from "date-fns";

export default function HistoryPage() {
  const { transactions, loading } = useTransactions();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => 
      tx.itemId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  const formatTimestamp = (date: Date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return date.toLocaleDateString();
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
                filteredTransactions.map((entry) => {
                  const isIncrease = entry.quantityChange > 0;
                  return (
                    <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`
                          h-10 w-10 rounded-full flex items-center justify-center border
                          ${isIncrease
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                            : 'bg-amber-50 border-amber-100 text-amber-600'}
                        `}>
                          {isIncrease ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {entry.category} <span className="text-slate-400 mx-1">•</span> {entry.itemId}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs font-normal bg-slate-100 text-slate-500">
                              {entry.user.name}
                            </Badge>
                            <span className="flex items-center text-xs text-slate-400">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatTimestamp(entry.timestamp)}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-xs text-slate-500 mt-1">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-bold ${isIncrease ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {isIncrease ? '+' : ''}{entry.quantityChange}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}