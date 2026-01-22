"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Trash2, ChevronDown, AlertCircle } from "lucide-react";
import { isValidPhoneNumber, formatPhoneDisplay } from "@/lib/utils/phone";

type Contact = Doc<"contacts">;

interface PhoneEntry {
  number: string;
  type: "mobile" | "work" | "home";
  isPrimary: boolean;
}

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null; // null = create mode, Contact = edit mode
  organizationId: Id<"organizations">;
}

const PHONE_TYPES: { value: "mobile" | "work" | "home"; label: string }[] = [
  { value: "mobile", label: "Mobile" },
  { value: "work", label: "Work" },
  { value: "home", label: "Home" },
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

// Format phone number as user types: xxx-xxx-xxxx
function formatPhoneInput(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");

  // Limit to 10 digits
  const limited = digits.slice(0, 10);

  // Format based on length
  if (limited.length <= 3) {
    return limited;
  } else if (limited.length <= 6) {
    return `${limited.slice(0, 3)}-${limited.slice(3)}`;
  } else {
    return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
  }
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  organizationId,
}: ContactDialogProps) {
  const isEditMode = !!contact;

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneEntry[]>([
    { number: "", type: "mobile", isPrimary: true },
  ]);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Convex mutations
  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const deleteContact = useMutation(api.contacts.remove);

  // Initialize form when contact changes or dialog opens
  useEffect(() => {
    if (open) {
      if (contact) {
        // Edit mode - populate form
        setFirstName(contact.firstName);
        setLastName(contact.lastName || "");
        setEmail(contact.email || "");
        setCompany(contact.company || "");
        setStreetAddress(contact.streetAddress || "");
        setCity(contact.city || "");
        setState(contact.state || "");
        setZipCode(contact.zipCode || "");
        setNotes(contact.notes || "");
        setPhoneNumbers(
          contact.phoneNumbers.map((p) => ({
            number: formatPhoneInput(p.number),
            type: p.type,
            isPrimary: p.isPrimary,
          }))
        );
      } else {
        // Create mode - reset form
        resetForm();
      }
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [open, contact]);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompany("");
    setStreetAddress("");
    setCity("");
    setState("");
    setZipCode("");
    setNotes("");
    setPhoneNumbers([{ number: "", type: "mobile", isPrimary: true }]);
  };

  const handlePhoneChange = (index: number, value: string) => {
    const updated = [...phoneNumbers];
    updated[index].number = formatPhoneInput(value);
    setPhoneNumbers(updated);
  };

  const handlePhoneTypeChange = (index: number, type: "mobile" | "work" | "home") => {
    const updated = [...phoneNumbers];
    updated[index].type = type;
    setPhoneNumbers(updated);
  };

  const handlePrimaryChange = (index: number) => {
    const updated = phoneNumbers.map((p, i) => ({
      ...p,
      isPrimary: i === index,
    }));
    setPhoneNumbers(updated);
  };

  const addPhoneNumber = () => {
    if (phoneNumbers.length < 5) {
      setPhoneNumbers([
        ...phoneNumbers,
        { number: "", type: "mobile", isPrimary: false },
      ]);
    }
  };

  const removePhoneNumber = (index: number) => {
    if (phoneNumbers.length > 1) {
      const updated = phoneNumbers.filter((_, i) => i !== index);
      // If we removed the primary, make the first one primary
      if (phoneNumbers[index].isPrimary && updated.length > 0) {
        updated[0].isPrimary = true;
      }
      setPhoneNumbers(updated);
    }
  };

  const validateForm = (): string | null => {
    if (!firstName.trim()) {
      return "First name is required";
    }

    // Validate phone numbers
    const validPhones = phoneNumbers.filter((p) => p.number.trim());
    if (validPhones.length === 0) {
      return "At least one phone number is required";
    }

    for (const phone of validPhones) {
      if (!isValidPhoneNumber(phone.number)) {
        return `Invalid phone number: ${phone.number}`;
      }
    }

    // Validate email if provided
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Invalid email address";
    }

    // Validate zip code if provided
    if (zipCode.trim() && !/^\d{5}(-\d{4})?$/.test(zipCode)) {
      return "Invalid zip code (use 5-digit or ZIP+4 format)";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Filter out empty phone numbers and ensure one is primary
    const validPhones = phoneNumbers.filter((p) => p.number.trim());
    if (!validPhones.some((p) => p.isPrimary)) {
      validPhones[0].isPrimary = true;
    }

    setIsSaving(true);
    try {
      if (isEditMode && contact) {
        await updateContact({
          contactId: contact._id,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          streetAddress: streetAddress.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zipCode: zipCode.trim() || undefined,
          notes: notes.trim() || undefined,
          phoneNumbers: validPhones,
        });
      } else {
        await createContact({
          organizationId,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          streetAddress: streetAddress.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zipCode: zipCode.trim() || undefined,
          notes: notes.trim() || undefined,
          phoneNumbers: validPhones,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "Failed to save contact");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;

    setIsDeleting(true);
    try {
      await deleteContact({ contactId: contact._id });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "Failed to delete contact");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClose = () => {
    if (!isSaving && !isDeleting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the contact details below."
              : "Fill in the details to create a new contact."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isSaving}
                  placeholder="John"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isSaving}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Company */}
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={isSaving}
                placeholder="Acme Corp"
              />
            </div>

            {/* Phone Numbers */}
            <div className="grid gap-2">
              <Label>Phone Numbers *</Label>
              <div className="space-y-2">
                {phoneNumbers.map((phone, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="tel"
                      value={phone.number}
                      onChange={(e) => handlePhoneChange(index, e.target.value)}
                      disabled={isSaving}
                      placeholder="xxx-xxx-xxxx"
                      className="flex-1"
                    />

                    {/* Phone Type Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-24 justify-between"
                          disabled={isSaving}
                        >
                          {PHONE_TYPES.find((t) => t.value === phone.type)?.label}
                          <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {PHONE_TYPES.map((type) => (
                          <DropdownMenuItem
                            key={type.value}
                            onClick={() => handlePhoneTypeChange(index, type.value)}
                          >
                            {type.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Primary Radio */}
                    <Button
                      type="button"
                      variant={phone.isPrimary ? "default" : "outline"}
                      size="sm"
                      className="w-20"
                      onClick={() => handlePrimaryChange(index)}
                      disabled={isSaving || phone.isPrimary}
                    >
                      {phone.isPrimary ? "Primary" : "Set"}
                    </Button>

                    {/* Remove Button */}
                    {phoneNumbers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhoneNumber(index)}
                        disabled={isSaving}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {phoneNumbers.length < 5 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPhoneNumber}
                    disabled={isSaving}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Phone Number
                  </Button>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSaving}
                placeholder="john@example.com"
              />
            </div>

            {/* Address */}
            <div className="grid gap-2">
              <Label htmlFor="streetAddress">Street Address</Label>
              <Input
                id="streetAddress"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                disabled={isSaving}
                placeholder="123 Main St"
              />
            </div>

            {/* City, State, Zip Row */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={isSaving}
                  placeholder="New York"
                />
              </div>
              <div className="col-span-1 grid gap-2">
                <Label htmlFor="state">State</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      disabled={isSaving}
                    >
                      {state || "—"}
                      <ChevronDown className="h-4 w-4 ml-1 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-60 overflow-y-auto">
                    <DropdownMenuItem onClick={() => setState("")}>
                      —
                    </DropdownMenuItem>
                    {US_STATES.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setState(s)}>
                        {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input
                  id="zipCode"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={isSaving}
                  placeholder="10001"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSaving}
                placeholder="Add any notes about this contact..."
                className="min-h-[80px]"
              />
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Delete Button (edit mode only) */}
            {isEditMode && !showDeleteConfirm && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || isDeleting}
                className="sm:mr-auto"
              >
                Delete
              </Button>
            )}

            {/* Delete Confirmation */}
            {isEditMode && showDeleteConfirm && (
              <div className="flex items-center gap-2 sm:mr-auto">
                <span className="text-sm text-destructive">Delete contact?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Yes, Delete"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSaving || isDeleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isDeleting}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  "Save Changes"
                ) : (
                  "Create Contact"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
