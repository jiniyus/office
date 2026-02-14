import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LayoutDashboard, Loader2 } from "lucide-react";

export default function Login() {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ 
          backgroundImage: 'url("/images/login-bg.png")',
          filter: 'brightness(0.85)'
        }}
      />
      
      {/* Overlay Gradient */}
      <div className="absolute inset-0 z-10 bg-gradient-to-tr from-slate-900/90 to-primary/40 backdrop-blur-[2px]" />

      <Card className="w-full max-w-md relative z-20 border-white/10 bg-white/95 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-1 text-center pb-8 pt-10">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back
          </CardTitle>
          <CardDescription className="text-slate-500">
            Enter your credentials to access the stock manager
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@stockpro.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white"
              />
            </div>
            <Button className="w-full h-11 text-base shadow-lg shadow-primary/20" type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-xs text-slate-400">
            Protected by enterprise-grade security
          </div>
        </CardContent>
      </Card>
    </div>
  );
}