"use client";

import { useState, useMemo } from "react";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, Phone, User, Loader2, Users, ChevronDown, Mail, Building2, MapPin, Pencil, Trash2, Tag, Check, X, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay, formatToE164 } from "@/lib/utils/phone";
import { cn } from "@/lib/utils";
import { tagColors } from "@/lib/style-constants";
import { useOptionalCallingContext } from "@/components/calling/calling-provider";

type Contact = Doc<"contacts">;
type ContactTag = Doc<"contactTags">;

interface ContactListCompactProps {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onNewContact: () => void;
  onEditContact?: (contact: Contact) => void;
  onDeleteContact?: (contact: Contact) => void;
  isLoading?: boolean;
  organizationId?: Id<"organizations">;
}

function ContactCard({
  contact,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  getPrimaryPhone,
  activeTags,
  onToggleTag,
}: {
  contact: Contact;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  getPrimaryPhone: (c: Contact) => string;
  activeTags?: ContactTag[];
  onToggleTag?: (contactId: Id<"contacts">, tagId: Id<"contactTags">, currentTags: Id<"contactTags">[]) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDndExpanded, setIsDndExpanded] = useState(false);
  const toggleEmailOptOut = useMutation(api.contacts.toggleEmailOptOut);
  const toggleVoiceOptOut = useMutation(api.contacts.toggleVoiceOptOut);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const address = [contact.streetAddress, contact.city, contact.state, contact.zipCode]
    .filter(Boolean)
    .join(", ");

  const contactTagIds = (contact.tags ?? []) as Id<"contactTags">[];

  // Build a map of assigned tag objects for display
  const assignedTags = activeTags?.filter((t) => contactTagIds.includes(t._id)) ?? [];

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "rounded-md transition-colors relative",
        isSelected ? "bg-surface-container-lowest" : "hover:bg-surface-container-high/50"
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 p-2.5">
        <button
          onClick={onSelect}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isSelected ? "bg-primary/20" : "bg-surface-container"
            )}
          >
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate flex items-center gap-1">
              <span className="truncate">{contact.firstName} {contact.lastName}</span>
              {(contact.smsOptedOut || contact.emailOptedOut || contact.voiceOptedOut) && (
                <span className="flex items-center gap-0.5 shrink-0">
                  {contact.smsOptedOut && <Badge variant="destructive" className="text-[8px] px-1 py-0">SMS</Badge>}
                  {contact.emailOptedOut && <Badge variant="destructive" className="text-[8px] px-1 py-0">Email</Badge>}
                  {contact.voiceOptedOut && <Badge variant="destructive" className="text-[8px] px-1 py-0">Voice</Badge>}
                </span>
              )}
            </p>
            <p className="text-xs text-on-surface-variant flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <span className="truncate">{getPrimaryPhone(contact)}</span>
            </p>
          </div>
        </button>

        {/* Edit / Delete - aligned with name */}
        {isExpanded && (onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 rounded text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && !showDeleteConfirm && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                className="p-1.5 rounded text-on-surface-variant hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {isExpanded && showDeleteConfirm && (
        <div className="flex items-center justify-end gap-1.5 px-2.5 pb-1">
          <span className="text-[12px] text-destructive">Delete contact?</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            className="text-[12px] px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
            className="text-[12px] px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Expand arrow - visible on hover or when expanded */}
      <div
        className={cn(
          "flex justify-center transition-all duration-200",
          isHovered || isExpanded ? "opacity-100 h-5" : "opacity-0 h-0 overflow-hidden"
        )}
      >
        <button
          onClick={handleExpandClick}
          className="flex items-center justify-center w-8 h-5 rounded-b-md text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Expanded details */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-3 pb-3 pt-1 mx-2.5">
          <div className="space-y-1.5 text-[14px]">
            {/* All phone numbers — each row is click-to-call */}
            {contact.phoneNumbers.map((p, i) => (
              <PhoneRow key={i} number={p.number} type={p.type} isPrimary={p.isPrimary} />
            ))}

            {/* Email */}
            {contact.email && (
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {/* Company */}
            {contact.company && (
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.company}</span>
              </div>
            )}

            {/* Address + action buttons */}
            {address && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{address}</span>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] px-2.5 py-1 rounded bg-surface-container hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    Maps
                  </a>
                  <a
                    href={`https://www.zillow.com/homes/${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] px-2.5 py-1 rounded bg-surface-container hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
                  >
                    Zillow
                  </a>
                  {/* Tag button */}
                  {activeTags && activeTags.length > 0 && onToggleTag && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="text-[12px] px-2.5 py-1 rounded bg-surface-container hover:bg-orange-500/10 hover:text-orange-600 transition-colors"
                        >
                          Tag
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1.5" align="center" side="bottom">
                        <div className="space-y-0.5">
                          {activeTags.map((tag) => {
                            const isAssigned = contactTagIds.includes(tag._id);
                            return (
                              <button
                                key={tag._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleTag(contact._id, tag._id, contactTagIds);
                                }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-surface-container-high transition-colors"
                              >
                                <div className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded border",
                                  isAssigned ? "bg-primary border-primary" : "border-muted-foreground/30"
                                )}>
                                  {isAssigned && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <div className={cn("h-2.5 w-2.5 rounded-full", tagColors[tag.color]?.dot ?? "bg-gray-500")} />
                                <span>{tag.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            )}

            {/* Tag button when no address (still show tag option) */}
            {!address && activeTags && activeTags.length > 0 && onToggleTag && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="text-[12px] px-2.5 py-1 rounded bg-surface-container hover:bg-orange-500/10 hover:text-orange-600 transition-colors"
                    >
                      Tag
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1.5" align="center" side="bottom">
                    <div className="space-y-0.5">
                      {activeTags.map((tag) => {
                        const isAssigned = contactTagIds.includes(tag._id);
                        return (
                          <button
                            key={tag._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTag(contact._id, tag._id, contactTagIds);
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-surface-container-high transition-colors"
                          >
                            <div className={cn(
                              "flex h-4 w-4 items-center justify-center rounded border",
                              isAssigned ? "bg-primary border-primary" : "border-muted-foreground/30"
                            )}>
                              {isAssigned && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <div className={cn("h-2.5 w-2.5 rounded-full", tagColors[tag.color]?.dot ?? "bg-gray-500")} />
                            <span>{tag.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Tags display */}
            {assignedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {assignedTags.map((tag) => (
                  <span
                    key={tag._id}
                    className="group/tag inline-flex items-center gap-1.5"
                  >
                    <span
                      className={cn(
                        "h-4 w-4 rounded-full border border-white shrink-0",
                        tagColors[tag.color]?.dot ?? "bg-gray-500"
                      )}
                    />
                    <span className={cn(
                      "text-[11px] font-semibold",
                      tagColors[tag.color]?.text ?? "text-foreground"
                    )}>
                      {tag.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentTags = contact.tags ?? [];
                        onToggleTag?.(contact._id, tag._id, currentTags);
                      }}
                      className="hidden group-hover/tag:inline-flex items-center justify-center h-4 w-4 rounded-full text-on-surface-variant hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Do Not Contact — collapsible card */}
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setIsDndExpanded(!isDndExpanded)}
                className="w-full flex items-center gap-2 rounded-lg border bg-surface-container/30 px-3 py-2 text-left hover:bg-surface-container-high/50 transition-colors"
              >
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide flex-1">Do Not Contact</span>
                {(contact.smsOptedOut || contact.emailOptedOut || contact.voiceOptedOut) && (
                  <span className="flex items-center gap-0.5">
                    {contact.smsOptedOut && <span className="text-[8px] px-1 py-0 rounded-full bg-destructive/10 text-destructive font-medium">SMS</span>}
                    {contact.emailOptedOut && <span className="text-[8px] px-1 py-0 rounded-full bg-destructive/10 text-destructive font-medium">Email</span>}
                    {contact.voiceOptedOut && <span className="text-[8px] px-1 py-0 rounded-full bg-destructive/10 text-destructive font-medium">Voice</span>}
                  </span>
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 text-on-surface-variant transition-transform", isDndExpanded && "rotate-180")} />
              </button>
              <div className={cn("overflow-hidden transition-all duration-200", isDndExpanded ? "max-h-40 opacity-100 mt-2" : "max-h-0 opacity-0")}>
                <div className="flex items-center gap-4 px-3">
                  {/* SMS - LOCKED when opted out */}
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={!!contact.smsOptedOut}
                      disabled={!!contact.smsOptedOut}
                      className="rounded h-3.5 w-3.5"
                      readOnly
                    />
                    <span className={contact.smsOptedOut ? "text-destructive" : "text-on-surface-variant"}>SMS</span>
                    {contact.smsOptedOut && <Lock className="h-3 w-3 text-on-surface-variant" />}
                  </label>

                  {/* Email - freely toggleable */}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contact.emailOptedOut}
                      onChange={() => toggleEmailOptOut({ contactId: contact._id })}
                      className="rounded h-3.5 w-3.5 cursor-pointer"
                    />
                    <span className={contact.emailOptedOut ? "text-destructive" : "text-on-surface-variant"}>Email</span>
                  </label>

                  {/* Voice - freely toggleable */}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contact.voiceOptedOut}
                      onChange={() => toggleVoiceOptOut({ contactId: contact._id })}
                      className="rounded h-3.5 w-3.5 cursor-pointer"
                    />
                    <span className={contact.voiceOptedOut ? "text-destructive" : "text-on-surface-variant"}>Voice</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Click-to-call row inside the expanded contact card. Shows the formatted
 * number + type + (primary) badge, and dials that specific number on click
 * via the CallingContext. Disabled when the Twilio Device isn't ready.
 */
function PhoneRow({
  number,
  type,
  isPrimary,
}: {
  number: string;
  type: string;
  isPrimary?: boolean;
}) {
  const callingContext = useOptionalCallingContext();
  const canCall = !!callingContext?.isReady && !!number;

  const handleCall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!callingContext) return;
    const e164 = formatToE164(number);
    try {
      await callingContext.makeCall(e164);
    } catch (err) {
      console.error("Click-to-call failed:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCall}
      disabled={!canCall}
      className={cn(
        "w-full flex items-center gap-2 text-on-surface-variant rounded px-1 py-0.5 -mx-1 text-left transition-colors",
        canCall
          ? "hover:bg-primary/10 hover:text-primary cursor-pointer"
          : "cursor-not-allowed opacity-70",
      )}
      title={canCall ? `Call ${number}` : "Phone system not ready"}
    >
      <Phone className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{formatPhoneDisplay(number)}</span>
      <span className="text-[11px] uppercase tracking-wide opacity-60">{type}</span>
      {isPrimary && (
        <span className="text-[11px] bg-primary/10 text-primary px-1 rounded">primary</span>
      )}
    </button>
  );
}

export function ContactListCompact({
  contacts,
  selectedContactId,
  onSelectContact,
  onNewContact,
  onEditContact,
  onDeleteContact,
  isLoading = false,
  organizationId,
}: ContactListCompactProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch active tags for this organization
  const activeTags = useQuery(
    api.contactTags.getActive,
    organizationId ? { organizationId } : "skip"
  );
  const updateContact = useMutation(api.contacts.update);

  const handleToggleTag = (contactId: Id<"contacts">, tagId: Id<"contactTags">, currentTags: Id<"contactTags">[]) => {
    const isAssigned = currentTags.includes(tagId);
    const newTags = isAssigned
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    updateContact({ contactId, tags: newTags });
  };

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }

    const query = searchQuery.toLowerCase();
    return contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.toLowerCase();
      if (fullName.includes(query)) return true;
      if (contact.company?.toLowerCase().includes(query)) return true;
      const queryDigits = query.replace(/\D/g, "");
      if (queryDigits.length >= 3) {
        const hasMatchingPhone = contact.phoneNumbers.some((p) =>
          p.number.replace(/\D/g, "").includes(queryDigits)
        );
        if (hasMatchingPhone) return true;
      }
      return false;
    });
  }, [contacts, searchQuery]);

  // Get primary phone for display
  const getPrimaryPhone = (contact: Contact): string => {
    const primary = contact.phoneNumbers.find((p) => p.isPrimary);
    return primary ? formatPhoneDisplay(primary.number) : formatPhoneDisplay(contact.phoneNumbers[0]?.number || "");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <Input placeholder="Search..." value="" className="pl-8 h-9" disabled />
          </div>
          <Button disabled className="w-full h-9" size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Contact
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button onClick={onNewContact} className="w-full h-9" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Contact
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-2">
              <div className="rounded-full bg-surface-container p-3 mb-3">
                <Users className="h-5 w-5 text-on-surface-variant" />
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No contacts yet</p>
              ) : (
                <p className="text-sm text-on-surface-variant">No matches</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredContacts.map((contact) => (
                <ContactCard
                  key={contact._id}
                  contact={contact}
                  isSelected={selectedContactId === contact._id}
                  onSelect={() => onSelectContact(contact)}
                  onEdit={onEditContact ? () => onEditContact(contact) : undefined}
                  onDelete={onDeleteContact ? () => onDeleteContact(contact) : undefined}
                  getPrimaryPhone={getPrimaryPhone}
                  activeTags={activeTags ?? undefined}
                  onToggleTag={handleToggleTag}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="px-3 py-2 border-t text-xs text-on-surface-variant text-center">
        {filteredContacts.length === contacts.length
          ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
          : `${filteredContacts.length} of ${contacts.length}`}
      </div>
    </div>
  );
}
