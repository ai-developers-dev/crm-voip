"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Users,
  Loader2,
} from "lucide-react";

// Format seconds to readable time (e.g., "1h 23m" or "45m")
function formatTalkTime(seconds: number): string {
  if (seconds === 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export default function StatsPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  // Get the Convex organization
  const convexOrg = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Get organization stats for today
  const orgStats = useQuery(
    api.callStats.getOrganizationStatsToday,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Get all users with their stats
  const usersWithStats = useQuery(
    api.callStats.getUsersWithStats,
    convexOrg?._id ? { organizationId: convexOrg._id } : "skip"
  );

  // Loading state
  if (!orgLoaded || convexOrg === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading statistics...</span>
        </div>
      </div>
    );
  }

  if (!convexOrg) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Organization Not Found</CardTitle>
            <CardDescription>
              Please complete your organization setup to view statistics.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = orgStats?.organization || {
    totalCalls: 0,
    inboundAnswered: 0,
    inboundMissed: 0,
    outbound: 0,
    totalTalkTime: 0,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Call Statistics</h1>
        <p className="text-muted-foreground">
          Today&apos;s call activity for {convexOrg.name}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inbound Answered</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.inboundAnswered}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missed Calls</CardTitle>
            <PhoneMissed className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.inboundMissed}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outbound</CardTitle>
            <PhoneOutgoing className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.outbound}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Talk Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTalkTime(stats.totalTalkTime)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Performance
          </CardTitle>
          <CardDescription>
            Individual call statistics for each agent today
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usersWithStats === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading agents...</span>
            </div>
          ) : usersWithStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No agents found in this organization.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <PhoneIncoming className="h-4 w-4 text-green-600" />
                      Inbound
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                      Outbound
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Phone className="h-4 w-4" />
                      Total
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-4 w-4" />
                      Talk Time
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithStats.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback>
                            {user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.role}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === "available"
                            ? "default"
                            : user.status === "on_call"
                            ? "secondary"
                            : "outline"
                        }
                        className={
                          user.status === "available"
                            ? "bg-green-100 text-green-700"
                            : user.status === "on_call"
                            ? "bg-blue-100 text-blue-700"
                            : ""
                        }
                      >
                        {user.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium text-green-600">
                      {user.stats.inboundCalls}
                    </TableCell>
                    <TableCell className="text-center font-medium text-blue-600">
                      {user.stats.outboundCalls}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {user.stats.totalCalls}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {formatTalkTime(user.stats.talkTimeSeconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
