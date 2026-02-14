import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export default function Profile() {
  const { user } = useAuth();

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Account Settings</h1>
          <p className="text-slate-500 mt-1">Manage your personal information and preferences.</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your profile details here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20 border-2 border-slate-100">
                  <AvatarImage src={user?.photoURL} />
                  <AvatarFallback className="text-lg bg-slate-100 text-slate-500">
                    {user?.displayName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <Button variant="outline" size="sm">Change Avatar</Button>
                  <p className="text-xs text-slate-500">JPG, GIF or PNG. Max size of 800K</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={user?.displayName} />
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
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input defaultValue="EMP-2024-001" disabled className="bg-slate-50" />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your password and security preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button variant="outline">Update Password</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}