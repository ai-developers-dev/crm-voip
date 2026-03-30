"use client";

import { useState, useEffect, useCallback } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface A2pRegistrationProps {
  organizationId: Id<"organizations">;
}

// Step definitions
const STEPS = [
  { id: 1, label: "Brand Info" },
  { id: 2, label: "Contact" },
  { id: 3, label: "Submit Brand" },
  { id: 4, label: "Campaign" },
  { id: 5, label: "Submit Campaign" },
  { id: 6, label: "Approved" },
];

const BUSINESS_TYPES = [
  "Corporation",
  "LLC",
  "Partnership",
  "Sole Proprietor",
  "Non-Profit",
  "Government",
] as const;

const INDUSTRIES = [
  { value: "INSURANCE", label: "Insurance" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "FINANCIAL", label: "Financial Services" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "RETAIL", label: "Retail" },
  { value: "EDUCATION", label: "Education" },
  { value: "OTHER", label: "Other" },
] as const;

const USE_CASES = [
  {
    value: "CUSTOMER_CARE",
    label: "Customer Care",
    description: "Notifications, reminders, account updates",
  },
  {
    value: "MIXED",
    label: "Mixed",
    description: "Customer care combined with promotional content",
  },
  {
    value: "MARKETING",
    label: "Marketing",
    description: "Promotional messages, offers, and sales",
  },
  {
    value: "LOW_VOLUME_MIXED",
    label: "Low Volume Mixed",
    description: "Under 6,000 messages/month, mixed content",
  },
] as const;

interface BrandFormData {
  legalBusinessName: string;
  ein: string;
  businessType: string;
  industry: string;
  websiteUrl: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  certify: boolean;
}

interface CampaignFormData {
  useCase: string;
  description: string;
  sampleMessages: string[];
  messageFlow: string;
  helpResponse: string;
  optInMessage: string;
  optOutMessage: string;
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhoneNumbers: boolean;
}

type BrandStatus = "none" | "pending" | "approved" | "failed";
type CampaignStatus = "none" | "pending" | "approved" | "failed";

export function A2pRegistration({ organizationId }: A2pRegistrationProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Brand form state
  const [brandForm, setBrandForm] = useState<BrandFormData>({
    legalBusinessName: "",
    ein: "",
    businessType: "",
    industry: "",
    websiteUrl: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });

  // Contact form state
  const [contactForm, setContactForm] = useState<ContactFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTitle: "",
    certify: false,
  });

  // Campaign form state
  const [campaignForm, setCampaignForm] = useState<CampaignFormData>({
    useCase: "",
    description: "",
    sampleMessages: ["", ""],
    messageFlow: "",
    helpResponse: "Reply HELP for help. Msg&data rates may apply.",
    optInMessage:
      "You are now opted in to receive messages from [Business].",
    optOutMessage:
      "You have been unsubscribed. Reply START to re-subscribe.",
    hasEmbeddedLinks: false,
    hasEmbeddedPhoneNumbers: false,
  });

  // Status polling
  const [brandStatus, setBrandStatus] = useState<BrandStatus>("none");
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>("none");
  const [approvedThroughput, setApprovedThroughput] = useState<string | null>(
    null
  );
  const [messagingServiceSid, setMessagingServiceSid] = useState<string | null>(
    null
  );

  // Poll for brand status
  const pollBrandStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/a2p/brand?organizationId=${organizationId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setBrandStatus(data.status as BrandStatus);
          if (data.status === "approved" && currentStep === 3) {
            setCurrentStep(4);
          }
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [organizationId, currentStep]);

  // Poll for campaign status
  const pollCampaignStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/a2p/campaign?organizationId=${organizationId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setCampaignStatus(data.status as CampaignStatus);
          if (data.throughput) setApprovedThroughput(data.throughput);
          if (data.messagingServiceSid)
            setMessagingServiceSid(data.messagingServiceSid);
          if (data.status === "approved" && currentStep === 5) {
            setCurrentStep(6);
          }
        }
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [organizationId, currentStep]);

  // Auto-poll when waiting for approval
  useEffect(() => {
    if (brandStatus === "pending" && currentStep === 3) {
      const interval = setInterval(pollBrandStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [brandStatus, currentStep, pollBrandStatus]);

  useEffect(() => {
    if (campaignStatus === "pending" && currentStep === 5) {
      const interval = setInterval(pollCampaignStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [campaignStatus, currentStep, pollCampaignStatus]);

  // Check for existing registration on mount
  useEffect(() => {
    const checkExisting = async () => {
      try {
        const brandRes = await fetch(
          `/api/a2p/brand?organizationId=${organizationId}`
        );
        if (brandRes.ok) {
          const brandData = await brandRes.json();
          if (brandData.status === "approved") {
            setBrandStatus("approved");
            // Check campaign
            const campaignRes = await fetch(
              `/api/a2p/campaign?organizationId=${organizationId}`
            );
            if (campaignRes.ok) {
              const campaignData = await campaignRes.json();
              if (campaignData.status === "approved") {
                setCampaignStatus("approved");
                if (campaignData.throughput)
                  setApprovedThroughput(campaignData.throughput);
                if (campaignData.messagingServiceSid)
                  setMessagingServiceSid(campaignData.messagingServiceSid);
                setCurrentStep(6);
              } else if (campaignData.status === "pending") {
                setCampaignStatus("pending");
                setCurrentStep(5);
              } else {
                setCurrentStep(4);
              }
            } else {
              setCurrentStep(4);
            }
          } else if (brandData.status === "pending") {
            setBrandStatus("pending");
            setCurrentStep(3);
          } else if (brandData.status === "failed") {
            setBrandStatus("failed");
            setCurrentStep(3);
          }
        }
      } catch {
        // No existing registration found, start at step 1
      }
    };
    checkExisting();
  }, [organizationId]);

  // Brand form validation
  const isBrandValid =
    brandForm.legalBusinessName.trim() !== "" &&
    brandForm.ein.trim() !== "" &&
    brandForm.businessType !== "" &&
    brandForm.industry !== "" &&
    brandForm.street.trim() !== "" &&
    brandForm.city.trim() !== "" &&
    brandForm.state.trim() !== "" &&
    brandForm.zip.trim() !== "";

  // Contact form validation
  const isContactValid =
    contactForm.firstName.trim() !== "" &&
    contactForm.lastName.trim() !== "" &&
    contactForm.email.trim() !== "" &&
    contactForm.phone.trim() !== "" &&
    contactForm.certify;

  // Campaign form validation
  const isCampaignValid =
    campaignForm.useCase !== "" &&
    campaignForm.description.trim().length >= 40 &&
    campaignForm.sampleMessages.filter((m) => m.trim() !== "").length >= 2 &&
    campaignForm.messageFlow.trim() !== "" &&
    campaignForm.helpResponse.trim() !== "" &&
    campaignForm.optInMessage.trim() !== "" &&
    campaignForm.optOutMessage.trim() !== "";

  // Submit brand
  const handleSubmitBrand = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/a2p/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...brandForm,
          contact: contactForm,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit brand registration");
      }
      setBrandStatus("pending");
      setCurrentStep(3);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit campaign
  const handleSubmitCampaign = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/a2p/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...campaignForm,
          sampleMessages: campaignForm.sampleMessages.filter(
            (m) => m.trim() !== ""
          ),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit campaign");
      }
      setCampaignStatus("pending");
      setCurrentStep(5);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add sample message
  const addSampleMessage = () => {
    if (campaignForm.sampleMessages.length < 5) {
      setCampaignForm((prev) => ({
        ...prev,
        sampleMessages: [...prev.sampleMessages, ""],
      }));
    }
  };

  // Remove sample message
  const removeSampleMessage = (index: number) => {
    if (campaignForm.sampleMessages.length > 2) {
      setCampaignForm((prev) => ({
        ...prev,
        sampleMessages: prev.sampleMessages.filter((_, i) => i !== index),
      }));
    }
  };

  // Update sample message
  const updateSampleMessage = (index: number, value: string) => {
    setCampaignForm((prev) => ({
      ...prev,
      sampleMessages: prev.sampleMessages.map((m, i) =>
        i === index ? value : m
      ),
    }));
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isComplete = step.id < currentStep;
        const isDisabled =
          (step.id === 4 || step.id === 5 || step.id === 6) &&
          brandStatus !== "approved";

        return (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-colors",
                isActive &&
                  "bg-primary text-primary-foreground",
                isComplete &&
                  "bg-primary/20 text-primary",
                !isActive &&
                  !isComplete &&
                  !isDisabled &&
                  "bg-surface-containertext-on-surface-variant",
                isDisabled && "bg-surface-container/50 text-on-surface-variant/50"
              )}
            >
              {isComplete ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                step.id
              )}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-4",
                  isComplete ? "bg-primary/40" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderBrandForm = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Brand Information</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Business details for A2P 10DLC registration
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Legal Business Name *</Label>
          <Input
            value={brandForm.legalBusinessName}
            onChange={(e) =>
              setBrandForm((f) => ({
                ...f,
                legalBusinessName: e.target.value,
              }))
            }
            placeholder="Acme Insurance LLC"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">EIN / Tax ID *</Label>
            <Input
              value={brandForm.ein}
              onChange={(e) =>
                setBrandForm((f) => ({ ...f, ein: e.target.value }))
              }
              placeholder="XX-XXXXXXX"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business Type *</Label>
            <Select
              value={brandForm.businessType}
              onValueChange={(v) =>
                setBrandForm((f) => ({ ...f, businessType: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Industry *</Label>
            <Select
              value={brandForm.industry}
              onValueChange={(v) =>
                setBrandForm((f) => ({ ...f, industry: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website URL</Label>
            <Input
              value={brandForm.websiteUrl}
              onChange={(e) =>
                setBrandForm((f) => ({ ...f, websiteUrl: e.target.value }))
              }
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Business Address</Label>
          <Input
            value={brandForm.street}
            onChange={(e) =>
              setBrandForm((f) => ({ ...f, street: e.target.value }))
            }
            placeholder="Street Address *"
          />
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            <Input
              value={brandForm.city}
              onChange={(e) =>
                setBrandForm((f) => ({ ...f, city: e.target.value }))
              }
              placeholder="City *"
            />
            <Input
              value={brandForm.state}
              onChange={(e) =>
                setBrandForm((f) => ({ ...f, state: e.target.value }))
              }
              placeholder="State *"
            />
            <Input
              value={brandForm.zip}
              onChange={(e) =>
                setBrandForm((f) => ({ ...f, zip: e.target.value }))
              }
              placeholder="ZIP *"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          onClick={() => setCurrentStep(2)}
          disabled={!isBrandValid}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  const renderContactForm = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Authorized Contact</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Representative authorized to register on behalf of the business
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">First Name *</Label>
            <Input
              value={contactForm.firstName}
              onChange={(e) =>
                setContactForm((f) => ({ ...f, firstName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Last Name *</Label>
            <Input
              value={contactForm.lastName}
              onChange={(e) =>
                setContactForm((f) => ({ ...f, lastName: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Email *</Label>
            <Input
              type="email"
              value={contactForm.email}
              onChange={(e) =>
                setContactForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone *</Label>
            <Input
              type="tel"
              value={contactForm.phone}
              onChange={(e) =>
                setContactForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Job Title</Label>
          <Input
            value={contactForm.jobTitle}
            onChange={(e) =>
              setContactForm((f) => ({ ...f, jobTitle: e.target.value }))
            }
            placeholder="Optional"
          />
        </div>

        <div className="flex items-start gap-2 pt-1">
          <Checkbox
            checked={contactForm.certify}
            onCheckedChange={(checked) =>
              setContactForm((f) => ({ ...f, certify: checked === true }))
            }
            className="mt-0.5"
          />
          <label className="text-xs text-on-surface-variant leading-relaxed cursor-pointer"
            onClick={() => setContactForm((f) => ({ ...f, certify: !f.certify }))}
          >
            I certify I am an authorized representative and this information is
            accurate
          </label>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentStep(1)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          size="sm"
          onClick={handleSubmitBrand}
          disabled={!isContactValid || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Submit Brand
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderBrandStatus = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Brand Registration</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Your brand has been submitted for review
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border px-4 py-3">
        {brandStatus === "pending" && (
          <>
            <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-medium">Brand Under Review</p>
              <p className="text-xs text-on-surface-variant">
                Checking status every 15 seconds...
              </p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Pending
            </Badge>
          </>
        )}
        {brandStatus === "approved" && (
          <>
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Brand Approved</p>
              <p className="text-xs text-on-surface-variant">
                You can now set up your campaign
              </p>
            </div>
            <Badge className="gap-1 bg-green-100 text-green-700">
              <CheckCircle className="h-3 w-3" />
              Approved
            </Badge>
          </>
        )}
        {brandStatus === "failed" && (
          <>
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Brand Registration Failed</p>
              <p className="text-xs text-on-surface-variant">
                Please review your information and try again
              </p>
            </div>
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          </>
        )}
      </div>

      <div className="flex justify-between pt-2">
        {brandStatus === "failed" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBrandStatus("none");
              setCurrentStep(1);
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Edit & Retry
          </Button>
        )}
        {brandStatus === "approved" && (
          <div className="ml-auto">
            <Button size="sm" onClick={() => setCurrentStep(4)}>
              Set Up Campaign
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const renderCampaignForm = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Campaign Setup</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Define how you will use SMS messaging
        </p>
      </div>

      <div className="space-y-3">
        {/* Use Case */}
        <div className="space-y-1.5">
          <Label className="text-xs">Use Case *</Label>
          <Select
            value={campaignForm.useCase}
            onValueChange={(v) =>
              setCampaignForm((f) => ({ ...f, useCase: v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select use case" />
            </SelectTrigger>
            <SelectContent>
              {USE_CASES.map((uc) => (
                <SelectItem key={uc.value} value={uc.value}>
                  {uc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {campaignForm.useCase && (
            <p className="text-xs text-on-surface-variant">
              {USE_CASES.find((uc) => uc.value === campaignForm.useCase)
                ?.description}
            </p>
          )}
        </div>

        {/* Campaign Description */}
        <div className="space-y-1.5">
          <Label className="text-xs">Campaign Description * (min 40 chars)</Label>
          <Textarea
            value={campaignForm.description}
            onChange={(e) =>
              setCampaignForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Describe how SMS will be used in your business..."
            rows={3}
          />
          <p className="text-xs text-on-surface-variant">
            {campaignForm.description.length}/40 characters minimum
          </p>
        </div>

        {/* Sample Messages */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Sample Messages * (2-5 required)</Label>
            {campaignForm.sampleMessages.length < 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={addSampleMessage}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Sample
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {campaignForm.sampleMessages.map((msg, idx) => (
              <div key={idx} className="flex gap-2">
                <Textarea
                  value={msg}
                  onChange={(e) => updateSampleMessage(idx, e.target.value)}
                  placeholder={`Sample message ${idx + 1}...`}
                  rows={2}
                  className="flex-1"
                />
                {campaignForm.sampleMessages.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 mt-1"
                    onClick={() => removeSampleMessage(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-on-surface-variant" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Message Flow */}
        <div className="space-y-1.5">
          <Label className="text-xs">Message Flow * (How do users opt in?)</Label>
          <Textarea
            value={campaignForm.messageFlow}
            onChange={(e) =>
              setCampaignForm((f) => ({ ...f, messageFlow: e.target.value }))
            }
            placeholder="Describe how end users consent to receive messages..."
            rows={2}
          />
        </div>

        {/* HELP / Opt-In / Opt-Out */}
        <div className="space-y-1.5">
          <Label className="text-xs">HELP Response *</Label>
          <Input
            value={campaignForm.helpResponse}
            onChange={(e) =>
              setCampaignForm((f) => ({
                ...f,
                helpResponse: e.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Opt-In Message *</Label>
          <Input
            value={campaignForm.optInMessage}
            onChange={(e) =>
              setCampaignForm((f) => ({
                ...f,
                optInMessage: e.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Opt-Out Message *</Label>
          <Input
            value={campaignForm.optOutMessage}
            onChange={(e) =>
              setCampaignForm((f) => ({
                ...f,
                optOutMessage: e.target.value,
              }))
            }
          />
        </div>

        {/* Content Flags */}
        <div className="space-y-2 pt-1">
          <Label className="text-xs">Content Flags</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={campaignForm.hasEmbeddedLinks}
              onCheckedChange={(checked) =>
                setCampaignForm((f) => ({
                  ...f,
                  hasEmbeddedLinks: checked === true,
                }))
              }
            />
            <label
              className="text-xs text-on-surface-variant cursor-pointer"
              onClick={() =>
                setCampaignForm((f) => ({
                  ...f,
                  hasEmbeddedLinks: !f.hasEmbeddedLinks,
                }))
              }
            >
              Messages may contain embedded links
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={campaignForm.hasEmbeddedPhoneNumbers}
              onCheckedChange={(checked) =>
                setCampaignForm((f) => ({
                  ...f,
                  hasEmbeddedPhoneNumbers: checked === true,
                }))
              }
            />
            <label
              className="text-xs text-on-surface-variant cursor-pointer"
              onClick={() =>
                setCampaignForm((f) => ({
                  ...f,
                  hasEmbeddedPhoneNumbers: !f.hasEmbeddedPhoneNumbers,
                }))
              }
            >
              Messages may contain embedded phone numbers
            </label>
          </div>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentStep(3)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          size="sm"
          onClick={handleSubmitCampaign}
          disabled={!isCampaignValid || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Submit Campaign
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderCampaignStatus = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Campaign Review</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Your campaign has been submitted for carrier review
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border px-4 py-3">
        {campaignStatus === "pending" && (
          <>
            <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-medium">Campaign Under Review</p>
              <p className="text-xs text-on-surface-variant">
                Carrier review typically takes 7-14 business days
              </p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Pending
            </Badge>
          </>
        )}
        {campaignStatus === "failed" && (
          <>
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Campaign Rejected</p>
              <p className="text-xs text-on-surface-variant">
                Please review your campaign details and resubmit
              </p>
            </div>
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Failed
            </Badge>
          </>
        )}
      </div>

      {campaignStatus === "failed" && (
        <div className="flex justify-start pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCampaignStatus("none");
              setCurrentStep(4);
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Edit & Retry
          </Button>
        </div>
      )}
    </div>
  );

  const renderApproved = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 px-4 py-4">
        <Shield className="h-6 w-6 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            SMS Compliance Approved
          </p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
            Your A2P 10DLC registration is complete
          </p>
        </div>
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      </div>

      {(approvedThroughput || messagingServiceSid) && (
        <div className="grid grid-cols-2 gap-3">
          {approvedThroughput && (
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-on-surface-variant">Throughput</p>
              <p className="text-sm font-medium">{approvedThroughput} msg/sec</p>
            </div>
          )}
          {messagingServiceSid && (
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-on-surface-variant">
                Messaging Service SID
              </p>
              <p className="text-sm font-mono">
                {messagingServiceSid.slice(0, 8)}...
                {messagingServiceSid.slice(-4)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {renderStepIndicator()}

      {currentStep === 1 && renderBrandForm()}
      {currentStep === 2 && renderContactForm()}
      {currentStep === 3 && renderBrandStatus()}
      {currentStep === 4 && renderCampaignForm()}
      {currentStep === 5 && renderCampaignStatus()}
      {currentStep === 6 && renderApproved()}
    </div>
  );
}
