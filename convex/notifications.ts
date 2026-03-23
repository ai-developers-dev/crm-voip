import { v } from "convex/values";
import { query } from "./_generated/server";

/** Get all notifications for a tenant user */
export const getForUser = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const tomorrow = todayStart + 86400000;
    const notifications: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      contactId?: string;
      contactName?: string;
      timestamp: number;
      icon: string;
    }> = [];

    // 1. Missed calls (today)
    const callHistory = await ctx.db
      .query("callHistory")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const missedCalls = callHistory.filter(
      (c) => c.outcome === "missed" && c.startedAt >= todayStart
    );
    for (const call of missedCalls.slice(0, 10)) {
      const contact = call.contactId ? await ctx.db.get(call.contactId) : null;
      notifications.push({
        id: `missed-${call._id}`,
        type: "missed_call",
        title: "Missed Call",
        description: contact
          ? `${contact.firstName} ${contact.lastName || ""} called`
          : `${call.from || "Unknown"} called`,
        contactId: call.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}` : undefined,
        timestamp: call.startedAt,
        icon: "PhoneMissed",
      });
    }

    // 2. Unread SMS (last 24h)
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const unreadConvos = conversations.filter(
      (c) => c.unreadCount > 0 && c.status === "active"
    );
    for (const convo of unreadConvos.slice(0, 10)) {
      const contact = convo.contactId ? await ctx.db.get(convo.contactId) : null;
      notifications.push({
        id: `sms-${convo._id}`,
        type: "unread_sms",
        title: "New SMS",
        description: contact
          ? `${contact.firstName} ${contact.lastName || ""}: ${convo.lastMessagePreview || "New message"}`
          : `${convo.customerPhoneNumber}: ${convo.lastMessagePreview || "New message"}`,
        contactId: convo.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}` : undefined,
        timestamp: convo.lastMessageAt,
        icon: "MessageSquare",
      });
    }

    // 3. Unread emails (last 24h)
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const unreadEmails = emails.filter(
      (e) => e.direction === "inbound" && !e.readAt && e.sentAt >= todayStart
    );
    for (const email of unreadEmails.slice(0, 10)) {
      const contact = email.contactId ? await ctx.db.get(email.contactId) : null;
      notifications.push({
        id: `email-${email._id}`,
        type: "unread_email",
        title: "New Email",
        description: contact
          ? `${contact.firstName} ${contact.lastName || ""}: ${email.subject || "No subject"}`
          : `${email.from}: ${email.subject || "No subject"}`,
        contactId: email.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}` : undefined,
        timestamp: email.sentAt,
        icon: "Mail",
      });
    }

    // 4. Tasks due today or overdue
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const dueTasks = tasks.filter((t) => {
      if (t.status === "completed") return false;
      if (args.userId && t.assignedToUserId !== args.userId) return false;
      return t.dueDate && t.dueDate <= tomorrow;
    });
    for (const task of dueTasks.slice(0, 10)) {
      const contact = task.contactId ? await ctx.db.get(task.contactId) : null;
      const isOverdue = task.dueDate && task.dueDate < todayStart;
      notifications.push({
        id: `task-${task._id}`,
        type: isOverdue ? "task_overdue" : "task_due",
        title: isOverdue ? "Task Overdue" : "Task Due Today",
        description: task.title,
        contactId: task.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}` : undefined,
        timestamp: task.dueDate || task.createdAt,
        icon: "ClipboardCheck",
      });
    }

    // 5. Upcoming appointments (next 2 hours)
    const twoHoursFromNow = now + 2 * 60 * 60 * 1000;
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const upcoming = appointments.filter((a) => {
      if (a.status !== "scheduled") return false;
      return a.appointmentDate >= now && a.appointmentDate <= twoHoursFromNow;
    });
    for (const appt of upcoming.slice(0, 5)) {
      const contact = appt.contactId ? await ctx.db.get(appt.contactId) : null;
      const mins = Math.round((appt.appointmentDate - now) / 60000);
      notifications.push({
        id: `appt-${appt._id}`,
        type: "upcoming_appointment",
        title: "Upcoming Appointment",
        description: `${appt.title} in ${mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`,
        contactId: appt.contactId,
        contactName: contact ? `${contact.firstName} ${contact.lastName || ""}` : undefined,
        timestamp: appt.appointmentDate,
        icon: "Calendar",
      });
    }

    // Sort by most recent first
    return notifications.sort((a, b) => b.timestamp - a.timestamp);
  },
});
