import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocations } from "@/lib/firestore-hooks";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { collection, addDoc, Timestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { capitalize } from "@/lib/utils";

export default function LocationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [newLocation, setNewLocation] = useState({
    name: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { locations, loading } = useLocations();
  const { user } = useAuth();
  const { toast } = useToast();

  const filteredLocations = useMemo(() => {
    return locations.filter(location =>
      location.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [locations, searchTerm]);

  const handleDeleteLocation = async (locationId: string) => {
    try {
      await deleteDoc(doc(db, "locations", locationId));
      toast({
        title: "Success",
        description: "Location deleted successfully",
      });
      setDeleteConfirmId(undefined);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete location",
      });
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a location name",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "locations"), {
        name: newLocation.name,
        description: newLocation.description || "",
        company: user?.company || "",
        createdAt: Timestamp.now(),
        createdBy: user?.email || "",
      });

      toast({
        title: "Success",
        description: "Location added successfully",
      });

      setNewLocation({ name: "", description: "" });
      setIsAddDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add location",
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
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Locations</h1>
            <p className="text-slate-500 mt-1">Manage your inventory locations.</p>
          </div>
          <Button
            className="w-full h-10 shadow-lg shadow-primary/20 md:w-auto"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Location
          </Button>
        </div>

        {/* Locations Card */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {/* Search Bar */}
            <div className="flex items-center p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search locations..."
                  className="pl-9 bg-white border-slate-200 focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Locations List */}
            <div className="divide-y divide-slate-100">
              {filteredLocations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  {locations.length === 0 ? "No locations yet" : "No locations found"}
                </div>
              ) : (
                filteredLocations.map((location) => (
                  <div
                    key={location.id}
                    className="p-4 flex items-start justify-between hover:bg-slate-50 transition-colors gap-4 group"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-base">
                        {capitalize(location.name)}
                      </h3>
                      {location.description && (
                        <p className="text-sm text-slate-600 mt-1">
                          {location.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-slate-500">
                          Created by <span className="font-medium">{location.createdBy}</span>
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                      onClick={() => setDeleteConfirmId(location.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== undefined} onOpenChange={(open) => !open && setDeleteConfirmId(undefined)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Location</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this location? This action cannot be undone.
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
                  handleDeleteLocation(deleteConfirmId);
                }
              }}
            >
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
            <DialogDescription>
              Enter the details of the new location below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Location Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Warehouse A, Store Front, Storage Room"
                value={newLocation.name}
                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Add a description for this location..."
                value={newLocation.description}
                onChange={(e) => setNewLocation({ ...newLocation, description: e.target.value })}
                className="min-h-24"
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
            <Button onClick={handleAddLocation} disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
