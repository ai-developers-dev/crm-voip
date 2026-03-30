"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface SalesGoalsManagerProps {
  organizationId: Id<"organizations">;
  /** If true, renders as a settings card with header. If false, renders inline. */
  asCard?: boolean;
}

export function SalesGoalsManager({ organizationId, asCard = true }: SalesGoalsManagerProps) {
  const goals = useQuery(api.salesGoals.list, { organizationId });
  const upsertGoal = useMutation(api.salesGoals.upsert);
  const removeGoal = useMutation(api.salesGoals.remove);

  const now = new Date();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<Id<"salesGoals"> | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<Id<"salesGoals"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    month: now.getMonth().toString(),
    year: now.getFullYear().toString(),
    dailyPremium: "",
    weeklyPremium: "",
    monthlyPremium: "",
    dailyPolicies: "",
    weeklyPolicies: "",
    monthlyPolicies: "",
  });

  const openAddDialog = () => {
    setEditingGoalId(null);
    setForm({
      month: now.getMonth().toString(),
      year: now.getFullYear().toString(),
      dailyPremium: "",
      weeklyPremium: "",
      monthlyPremium: "",
      dailyPolicies: "",
      weeklyPolicies: "",
      monthlyPolicies: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (goal: NonNullable<typeof goals>[number]) => {
    setEditingGoalId(goal._id);
    setForm({
      month: goal.month.toString(),
      year: goal.year.toString(),
      dailyPremium: goal.dailyPremium?.toString() ?? "",
      weeklyPremium: goal.weeklyPremium?.toString() ?? "",
      monthlyPremium: goal.monthlyPremium?.toString() ?? "",
      dailyPolicies: goal.dailyPolicies?.toString() ?? "",
      weeklyPolicies: goal.weeklyPolicies?.toString() ?? "",
      monthlyPolicies: goal.monthlyPolicies?.toString() ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertGoal({
        organizationId,
        month: parseInt(form.month),
        year: parseInt(form.year),
        dailyPremium: form.dailyPremium ? parseFloat(form.dailyPremium) : undefined,
        weeklyPremium: form.weeklyPremium ? parseFloat(form.weeklyPremium) : undefined,
        monthlyPremium: form.monthlyPremium ? parseFloat(form.monthlyPremium) : undefined,
        dailyPolicies: form.dailyPolicies ? parseInt(form.dailyPolicies) : undefined,
        weeklyPolicies: form.weeklyPolicies ? parseInt(form.weeklyPolicies) : undefined,
        monthlyPolicies: form.monthlyPolicies ? parseInt(form.monthlyPolicies) : undefined,
      });
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save goal:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGoalId) return;
    try {
      await removeGoal({ goalId: deletingGoalId });
      setDeleteDialogOpen(false);
      setDeletingGoalId(null);
    } catch (err) {
      console.error("Failed to delete goal:", err);
    }
  };

  const yearOptions = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) {
    yearOptions.push(y);
  }

  const content = (
    <>
      {goals === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-8 text-on-surface-variant">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sales goals configured yet.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Goal
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Monthly Premium</TableHead>
                  <TableHead className="text-right">Monthly Policies</TableHead>
                  <TableHead className="text-right">Weekly Premium</TableHead>
                  <TableHead className="text-right">Daily Premium</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((goal) => (
                  <TableRow key={goal._id}>
                    <TableCell className="font-medium">
                      {MONTH_NAMES[goal.month]} {goal.year}
                    </TableCell>
                    <TableCell className="text-right">
                      {goal.monthlyPremium ? formatCurrency(goal.monthlyPremium) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {goal.monthlyPolicies ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {goal.weeklyPremium ? formatCurrency(goal.weeklyPremium) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {goal.dailyPremium ? formatCurrency(goal.dailyPremium) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => openEditDialog(goal)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingGoalId(goal._id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Goal
          </Button>
        </div>
      )}

      {/* Add/Edit Goal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGoalId ? "Edit Sales Goal" : "Add Sales Goal"}</DialogTitle>
            <DialogDescription>
              Set premium and policy count targets for a specific month.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="space-y-4 py-4">
              {/* Month/Year Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Month</Label>
                  <Select
                    value={form.month}
                    onValueChange={(val) => setForm((f) => ({ ...f, month: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Year</Label>
                  <Select
                    value={form.year}
                    onValueChange={(val) => setForm((f) => ({ ...f, year: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y.toString()}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Premium Goals */}
              <h3 className="font-medium text-sm text-on-surface-variant pt-2">Premium Goals</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Daily ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.dailyPremium}
                    onChange={(e) => setForm((f) => ({ ...f, dailyPremium: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Weekly ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.weeklyPremium}
                    onChange={(e) => setForm((f) => ({ ...f, weeklyPremium: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Monthly ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.monthlyPremium}
                    onChange={(e) => setForm((f) => ({ ...f, monthlyPremium: e.target.value }))}
                  />
                </div>
              </div>

              {/* Policy Count Goals */}
              <h3 className="font-medium text-sm text-on-surface-variant pt-2">Policy Count Goals</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Daily</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.dailyPolicies}
                    onChange={(e) => setForm((f) => ({ ...f, dailyPolicies: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Weekly</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.weeklyPolicies}
                    onChange={(e) => setForm((f) => ({ ...f, weeklyPolicies: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Monthly</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.monthlyPolicies}
                    onChange={(e) => setForm((f) => ({ ...f, monthlyPolicies: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingGoalId ? (
                  "Update Goal"
                ) : (
                  "Add Goal"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeletingGoalId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sales Goal</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this sales goal? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingGoalId(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!asCard) return content;

  const goalCount = goals?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-sm">Sales Goals</CardTitle>
              <CardDescription>Premium & Policy Targets</CardDescription>
            </div>
          </div>
          {goalCount > 0 ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              {goalCount} {goalCount === 1 ? "Goal" : "Goals"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              Not Set
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}
