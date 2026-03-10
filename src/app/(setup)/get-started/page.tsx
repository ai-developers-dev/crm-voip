"use client";

import { useAuth, useOrganization, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Building2, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSelfServiceTenant } from "./actions";

export default function GetStartedPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { organization } = useOrganization();
  const router = useRouter();
  const { setActive } = useClerk();

  // If user already has an org, redirect to dashboard
  useEffect(() => {
    if (isLoaded && isSignedIn && organization) {
      router.push("/dashboard");
    }
  }, [isLoaded, isSignedIn, organization, router]);

  // If not signed in, redirect to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  const agencyTypes = useQuery(api.agencyTypes.getActive);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  const [formData, setFormData] = useState({
    businessName: "",
    ownerName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    agencyTypeId: undefined as string | undefined,
    basePlanPrice: 49,
    perUserPrice: 15,
    includedUsers: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    const result = await createSelfServiceTenant(formData);

    if (result.success && result.clerkOrgId) {
      setCreateSuccess(true);
      // Set the new org as active in Clerk, then redirect
      await setActive({ organization: result.clerkOrgId });
      router.push("/onboarding");
    } else {
      setCreateError(result.error || "Something went wrong");
      setIsCreating(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn || organization) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set Up Your Business</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us about your agency to get started with VoIP CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>
            This information will be used for your account and billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {createError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            {createSuccess && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Business created! Redirecting to setup wizard...
                </AlertDescription>
              </Alert>
            )}

            {/* Business Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, businessName: e.target.value }))
                  }
                  placeholder="Acme Insurance Agency"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner Name *</Label>
                <Input
                  id="ownerName"
                  value={formData.ownerName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, ownerName: e.target.value }))
                  }
                  placeholder="John Smith"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="streetAddress">Street Address *</Label>
              <Input
                id="streetAddress"
                value={formData.streetAddress}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, streetAddress: e.target.value }))
                }
                placeholder="123 Main St"
                required
                disabled={isCreating || createSuccess}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, city: e.target.value }))
                  }
                  placeholder="Springfield"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, state: e.target.value }))
                  }
                  placeholder="IL"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP *</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, zip: e.target.value }))
                  }
                  placeholder="62701"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="(555) 123-4567"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="john@acmeinsurance.com"
                  required
                  disabled={isCreating || createSuccess}
                />
              </div>
            </div>

            {/* Agency Type */}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="agencyType">Agency Type</Label>
              <Select
                value={formData.agencyTypeId || ""}
                onValueChange={(value) => {
                  const selectedType = agencyTypes?.find((t) => t._id === value);
                  setFormData((prev) => ({
                    ...prev,
                    agencyTypeId: value || undefined,
                    ...(selectedType?.monthlyBasePrice != null && {
                      basePlanPrice: selectedType.monthlyBasePrice,
                    }),
                    ...(selectedType?.perUserPrice != null && {
                      perUserPrice: selectedType.perUserPrice,
                    }),
                  }));
                }}
                disabled={isCreating || createSuccess}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agency type (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {agencyTypes?.map((type) => (
                    <SelectItem key={type._id} value={type._id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecting an agency type will auto-fill default pricing
              </p>
            </div>

            {/* Pricing */}
            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground">Plan & Pricing</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="basePlanPrice">Base Plan ($/mo)</Label>
                  <Input
                    id="basePlanPrice"
                    type="number"
                    min="0"
                    value={formData.basePlanPrice}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        basePlanPrice: parseInt(e.target.value) || 0,
                      }))
                    }
                    disabled={isCreating || createSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perUserPrice">Per User ($/mo)</Label>
                  <Input
                    id="perUserPrice"
                    type="number"
                    min="0"
                    value={formData.perUserPrice}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        perUserPrice: parseInt(e.target.value) || 0,
                      }))
                    }
                    disabled={isCreating || createSuccess}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="includedUsers">Included Users</Label>
                  <Input
                    id="includedUsers"
                    type="number"
                    min="1"
                    value={formData.includedUsers}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        includedUsers: parseInt(e.target.value) || 1,
                      }))
                    }
                    disabled={isCreating || createSuccess}
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isCreating || createSuccess}
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your business...
                </>
              ) : createSuccess ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Redirecting...
                </>
              ) : (
                "Create Business & Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
