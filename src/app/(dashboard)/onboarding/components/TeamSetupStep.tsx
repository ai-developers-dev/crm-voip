"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Users, AlertCircle } from "lucide-react";

interface TeamSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface TeamMember {
  name: string;
  email: string;
  role: "agent" | "supervisor";
}

export function TeamSetupStep({ onNext, onBack, onSkip }: TeamSetupStepProps) {
  const { organization } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState<TeamMember>({
    name: "",
    email: "",
    role: "agent",
  });

  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const createUser = useMutation(api.users.createUser);
  const ensureOrganization = useMutation(api.organizations.ensureOrganization);

  const handleAddMember = () => {
    if (!formData.name || !formData.email) {
      setError("Name and email are required.");
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    // Check for duplicate
    if (members.some((m) => m.email.toLowerCase() === formData.email.toLowerCase())) {
      setError("This email has already been added.");
      return;
    }

    setMembers([...members, formData]);
    setFormData({ name: "", email: "", role: "agent" });
    setShowForm(false);
    setError(null);
  };

  const handleRemoveMember = (email: string) => {
    setMembers(members.filter((m) => m.email !== email));
  };

  const handleSubmit = async () => {
    if (members.length === 0) {
      onSkip();
      return;
    }

    if (!organization?.id) {
      setError("Organization not found. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Ensure organization exists
      let orgId = convexOrg?._id;
      if (!orgId) {
        orgId = await ensureOrganization({
          clerkOrgId: organization.id,
          name: organization.name || "Organization",
          slug: organization.slug || organization.id,
        });
      }

      // Create all users
      for (const member of members) {
        await createUser({
          organizationId: orgId,
          name: member.name,
          email: member.email,
          role: member.role,
        });
      }

      onNext();
    } catch (err: any) {
      setError(err.message || "Failed to add team members. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Add Your Team</h2>
        <p className="text-muted-foreground">
          Invite agents and supervisors to handle calls. You can always add more later.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Added members */}
      {members.length > 0 && (
        <div className="space-y-2">
          <Label>Team Members ({members.length})</Label>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.email}
                className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {member.role === "supervisor" ? "Supervisor" : "Agent"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMember(member.email)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add member form */}
      {showForm ? (
        <div className="space-y-4 p-4 rounded-lg border border-border/60 bg-muted/30">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="John Smith"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
              value={formData.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value as any }))}
            >
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddMember}>
              Add Member
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Team Member
        </Button>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : members.length > 0 ? (
              "Add & Continue"
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
