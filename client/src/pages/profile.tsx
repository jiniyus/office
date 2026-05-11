import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useStockItems } from "@/lib/firestore-hooks";
import {
  getAdvancedTransactionAudit,
  recalculateAdvancedState,
  type AdvancedTransactionAuditRow,
} from "@/lib/advanced-history";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Wrench, Search } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const { items } = useStockItems();
  const { toast } = useToast();
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedAuditItemId, setSelectedAuditItemId] = useState("");
  const [isAuditPickerOpen, setIsAuditPickerOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<AdvancedTransactionAuditRow[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        if (nameCompare !== 0) return nameCompare;
        return a.category.localeCompare(b.category, undefined, { numeric: true, sensitivity: "base" });
      }),
    [items]
  );

  const selectedAuditItem = items.find((entry) => entry.id === selectedAuditItemId);
  const selectedAuditLabel = selectedAuditItem
    ? `${selectedAuditItem.name} - ${selectedAuditItem.category}`
    : "Select item to inspect";

  useEffect(() => {
    setAdminPassword("");
    const clearAutofill = window.setTimeout(() => setAdminPassword(""), 100);
    return () => window.clearTimeout(clearAutofill);
  }, []);

  const validateAdminPassword = () => {
    if (adminPassword !== "4321") {
      toast({
        variant: "destructive",
        title: "Incorrect password",
        description: "Enter the admin tools password.",
      });
      return false;
    }

    return true;
  };

  const handleRecalculateAll = async () => {
    if (!validateAdminPassword()) return;

    try {
      setIsRecalculating(true);
      await recalculateAdvancedState(user?.company);
      toast({
        title: "Recalculation complete",
        description: "All advanced stock balances were rebuilt from transaction history.",
      });
    } catch (error) {
      console.error("Error recalculating stock:", error);
      toast({
        variant: "destructive",
        title: "Recalculation failed",
        description: "Could not rebuild stock balances.",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleLoadAudit = async () => {
    if (!validateAdminPassword()) return;

    const item = items.find((entry) => entry.id === selectedAuditItemId);
    if (!item) {
      toast({
        variant: "destructive",
        title: "Select an item",
        description: "Choose a stock item before loading the audit.",
      });
      return;
    }

    try {
      setIsLoadingAudit(true);
      const rows = await getAdvancedTransactionAudit(user?.company, item.name, item.category);
      setAuditRows(rows);
      toast({
        title: "Audit loaded",
        description: `Found ${rows.length} replay entries for ${item.name}.`,
      });
    } catch (error) {
      console.error("Error loading transaction audit:", error);
      toast({
        variant: "destructive",
        title: "Audit failed",
        description: "Could not load replay audit.",
      });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const formatDateTime = (date?: Date) => (date ? format(date, "MMM dd, yyyy HH:mm:ss") : "-");
  const formatBalances = (balances: { ht: number; fa: number; of: number }) =>
    `HT ${balances.ht} / FA ${balances.fa} / OF ${balances.of}`;

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Account Settings</h1>
          <p className="text-slate-500 mt-1">View your account information.</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your account details are displayed below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={user?.displayName} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input defaultValue={user?.email} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center h-10">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Administrator</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin Repair Tools</CardTitle>
              <CardDescription>Rebuild balances and inspect transaction replay order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Admin Password</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="one-time-code"
                    name="admin-action-code"
                    value={adminPassword}
                    onChange={(event) =>
                      setAdminPassword(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="Enter password"
                  />
                </div>
                <Button onClick={handleRecalculateAll} disabled={isRecalculating}>
                  <Wrench className="mr-2 h-4 w-4" />
                  {isRecalculating ? "Recalculating..." : "Recalculate All Stock"}
                </Button>
              </div>

              <div className="grid gap-4 border-t border-slate-100 pt-6 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Transaction Audit Item</Label>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm shadow-sm"
                      onClick={() => setIsAuditPickerOpen((current) => !current)}
                    >
                      <span className={selectedAuditItem ? "text-slate-900" : "text-slate-500"}>
                        {selectedAuditLabel}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </button>

                    {isAuditPickerOpen && (
                      <div className="absolute z-20 mt-1 h-36 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                        {sortedItems.map((item) => {
                          const isSelected = selectedAuditItemId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "text-slate-700 hover:bg-slate-100"
                              }`}
                              onClick={() => {
                                setSelectedAuditItemId(item.id);
                                setIsAuditPickerOpen(false);
                              }}
                            >
                              {item.name} - {item.category}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={handleLoadAudit} disabled={isLoadingAudit}>
                  <Search className="mr-2 h-4 w-4" />
                  {isLoadingAudit ? "Loading..." : "Load Audit"}
                </Button>
              </div>

              {auditRows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Order</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Actual Time</th>
                        <th className="px-3 py-2 font-semibold">Business Date</th>
                        <th className="px-3 py-2 font-semibold">Before</th>
                        <th className="px-3 py-2 font-semibold">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditRows.map((row, index) => (
                        <tr key={row.id} className="bg-white">
                          <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{row.type.replaceAll("_", " ")}</div>
                            {row.groupId && <div className="text-xs text-slate-500">{row.groupId}</div>}
                          </td>
                          <td className="px-3 py-2 font-semibold">{row.quantityChange}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDateTime(row.timestamp)}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {row.businessDate ? format(row.businessDate, "MMM dd, yyyy") : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatBalances(row.before)}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{formatBalances(row.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
