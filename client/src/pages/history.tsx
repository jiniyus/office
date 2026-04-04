import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownLeft, Search, Trash2, Calendar } from "lucide-react";
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
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function HistoryPage() {
  const { transactions, loading } = useTransactions();
  const { locations } = useLocations();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const { toast } = useToast();

  const filteredTransactions = useMemo(() => {
    if (!selectedDate) return transactions;
    
    return transactions.filter(tx => {
      const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
      return txDate === selectedDate;
    });
  }, [transactions, selectedDate]);

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
                filteredTransactions.map((entry) => {
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
                      <div className={`text-sm font-black flex-shrink-0 ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
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