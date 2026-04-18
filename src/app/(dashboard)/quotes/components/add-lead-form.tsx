"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2 } from "lucide-react";

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium leading-none ${className ?? ""}`}>{children}</label>;
}

interface Vehicle {
  year: number;
  make: string;
  model: string;
  vin: string;
  primaryUse: string;
}

interface LeadFormProps {
  organizationId: Id<"organizations">;
  lead?: any;
  onClose: () => void;
  onAdded: () => void;
}

const INITIAL_VEHICLE: Vehicle = { year: new Date().getFullYear(), make: "", model: "", vin: "", primaryUse: "commute" };

function initVehicles(lead?: any): Vehicle[] {
  if (lead?.vehicles?.length) {
    return lead.vehicles.map((v: any) => ({
      year: v.year ?? new Date().getFullYear(),
      make: v.make ?? "",
      model: v.model ?? "",
      vin: v.vin ?? "",
      primaryUse: v.primaryUse ?? "commute",
    }));
  }
  return [{ ...INITIAL_VEHICLE }];
}

export function AddLeadForm({ organizationId, lead, onClose, onAdded }: LeadFormProps) {
  const isEdit = !!lead;
  const createLead = useMutation(api.insuranceLeads.create);
  const updateLead = useMutation(api.insuranceLeads.update);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState(lead?.firstName ?? "");
  const [lastName, setLastName] = useState(lead?.lastName ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [dob, setDob] = useState(lead?.dob ?? "");
  const [gender, setGender] = useState(lead?.gender ?? "");
  const [maritalStatus, setMaritalStatus] = useState(lead?.maritalStatus ?? "");
  const [street, setStreet] = useState(lead?.street ?? "");
  const [city, setCity] = useState(lead?.city ?? "");
  const [state, setState] = useState(lead?.state ?? "");
  const [zip, setZip] = useState(lead?.zip ?? "");
  const [quoteAuto, setQuoteAuto] = useState(lead ? lead.quoteTypes?.includes("auto") : true);
  const [quoteHome, setQuoteHome] = useState(lead ? lead.quoteTypes?.includes("home") : false);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initVehicles(lead));
  const [yearBuilt, setYearBuilt] = useState(lead?.property?.yearBuilt ? String(lead.property.yearBuilt) : "");
  const [sqft, setSqft] = useState(lead?.property?.sqft ? String(lead.property.sqft) : "");
  const [constructionType, setConstructionType] = useState(lead?.property?.constructionType ?? "");
  const [ownershipType, setOwnershipType] = useState(lead?.property?.ownershipType ?? "own");
  const [notes, setNotes] = useState(lead?.notes ?? "");

  const addVehicle = () => setVehicles((v) => [...v, { ...INITIAL_VEHICLE }]);
  const removeVehicle = (i: number) => setVehicles((v) => v.filter((_, idx) => idx !== i));
  const updateVehicle = (i: number, field: keyof Vehicle, value: string | number) =>
    setVehicles((v) => v.map((veh, idx) => (idx === i ? { ...veh, [field]: value } : veh)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !dob || !street || !city || !state || !zip) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!quoteAuto && !quoteHome) {
      setError("Select at least one quote type.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const quoteTypes: string[] = [];
      if (quoteAuto) quoteTypes.push("auto");
      if (quoteHome) quoteTypes.push("home");

      const vehicleData = quoteAuto
        ? vehicles
            .filter((v) => v.make && v.model)
            .map((v) => ({
              year: Number(v.year),
              make: v.make,
              model: v.model,
              vin: v.vin || undefined,
              primaryUse: v.primaryUse || undefined,
            }))
        : undefined;

      const propertyData = quoteHome
        ? {
            yearBuilt: yearBuilt ? Number(yearBuilt) : undefined,
            sqft: sqft ? Number(sqft) : undefined,
            constructionType: constructionType || undefined,
            ownershipType: ownershipType || undefined,
          }
        : undefined;

      if (isEdit) {
        await updateLead({
          id: lead._id,
          firstName, lastName,
          email: email || undefined,
          phone: phone || undefined,
          dob,
          gender: gender || undefined,
          maritalStatus: maritalStatus || undefined,
          street, city, state, zip,
          quoteTypes,
          vehicles: vehicleData,
          property: propertyData,
          notes: notes || undefined,
        });
      } else {
        await createLead({
          organizationId,
          firstName, lastName,
          email: email || undefined,
          phone: phone || undefined,
          dob,
          gender: gender || undefined,
          maritalStatus: maritalStatus || undefined,
          street, city, state, zip,
          quoteTypes,
          vehicles: vehicleData,
          property: propertyData,
          notes: notes || undefined,
        });
      }
      onAdded();
    } catch (err: any) {
      setError(err.message || "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-surface-container-lowest h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Lead" : "Add Insurance Lead"}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 px-6 py-5 space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required />
              </div>
              <div className="space-y-1">
                <Label>Last Name *</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-555-5555" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">Personal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Date of Birth *</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">--</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Marital Status</Label>
                <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">--</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">Address</h3>
            <div className="space-y-1">
              <Label>Street *</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1 col-span-1">
                <Label>City *</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chicago" required />
              </div>
              <div className="space-y-1">
                <Label>State *</Label>
                <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="IL" maxLength={2} required />
              </div>
              <div className="space-y-1">
                <Label>ZIP *</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="60601" required />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">Quote Types</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={quoteAuto} onChange={(e) => setQuoteAuto(e.target.checked)} className="rounded" />
                Auto Insurance
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={quoteHome} onChange={(e) => setQuoteHome(e.target.checked)} className="rounded" />
                Home / Renters
              </label>
            </div>
          </section>

          {quoteAuto && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">
                Vehicles <span className="text-xs font-normal text-on-surface-variant normal-case">(optional -- NatGen auto-finds via DMV)</span>
              </h3>
              {vehicles.map((v, i) => (
                <div key={i} className="rounded-2xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-on-surface-variant">Vehicle {i + 1}</span>
                    {vehicles.length > 1 && (
                      <button type="button" onClick={() => removeVehicle(i)} className="text-on-surface-variant hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Year</Label><Input type="number" value={v.year} onChange={(e) => updateVehicle(i, "year", Number(e.target.value))} min={1980} max={new Date().getFullYear() + 1} /></div>
                    <div className="space-y-1"><Label className="text-xs">Make</Label><Input value={v.make} onChange={(e) => updateVehicle(i, "make", e.target.value)} placeholder="Toyota" /></div>
                    <div className="space-y-1"><Label className="text-xs">Model</Label><Input value={v.model} onChange={(e) => updateVehicle(i, "model", e.target.value)} placeholder="Camry" /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">VIN (optional)</Label><Input value={v.vin} onChange={(e) => updateVehicle(i, "vin", e.target.value)} placeholder="1HGCM82633A..." /></div>
                    <div className="space-y-1">
                      <Label className="text-xs">Primary Use</Label>
                      <select value={v.primaryUse} onChange={(e) => updateVehicle(i, "primaryUse", e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm">
                        <option value="commute">Commute</option>
                        <option value="pleasure">Pleasure</option>
                        <option value="business">Business</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addVehicle} className="text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Vehicle
              </Button>
            </section>
          )}

          {quoteHome && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">Property</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Year Built</Label><Input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} placeholder="1995" /></div>
                <div className="space-y-1"><Label>Sq Ft</Label><Input type="number" value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="1800" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Construction Type</Label>
                  <select value={constructionType} onChange={(e) => setConstructionType(e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="">--</option>
                    <option value="frame">Frame</option>
                    <option value="masonry">Masonry</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Ownership</Label>
                  <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)} className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="own">Own</option>
                    <option value="rent">Rent</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-1">
            <Label>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any additional notes..." className="flex w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm placeholder:text-on-surface-variant resize-none" />
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pb-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Lead"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
