import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionView {
  id: string;
  weekNumber: number;
  startsAt: Date;
  durationMinutes: number;
  activity: string;
  venueName: string;
  venueAddress: string;
  nearestSubway: string | null;
  walkMinutes: number | null;
  doorNote: string | null;
  whatToBring: string | null;
  hostName: string | null;
}

export interface CohortView {
  id: string;
  status: string;
  neighborhood: string;
  ageBand: string;
  womenOnly: boolean;
  priceCents: number;
  /** What was promised before payment. Shown on the offer screen, unchanged. */
  promised: { size: number; women: number };
  groupChatUrl: string | null;
  sessions: SessionView[];
  /** First names only, and only once the viewer has paid. Never browsable. */
  members: Array<{ firstName: string }>;
}

function firstName(displayName: string | null): string {
  if (!displayName) return 'A member';
  const parts = displayName.trim().split(' ');
  return parts[0] ?? 'A member';
}

@Injectable()
export class CohortsService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(userId: string): Promise<CohortView | null> {
    const membership = await this.prisma.cohortMember.findFirst({
      where: { userId, status: { in: ['INVITED', 'PAID', 'ACTIVE'] } },
      orderBy: { joinedAt: 'desc' },
      include: {
        cohort: {
          include: {
            sessions: { orderBy: { weekNumber: 'asc' } },
            members: { include: { user: true } },
          },
        },
      },
    });

    if (!membership) return null;
    return this.toView(membership.cohort, membership.status);
  }

  async byId(userId: string, cohortId: string): Promise<CohortView> {
    const membership = await this.prisma.cohortMember.findUnique({
      where: { cohortId_userId: { cohortId, userId } },
      include: {
        cohort: {
          include: {
            sessions: { orderBy: { weekNumber: 'asc' } },
            members: { include: { user: true } },
          },
        },
      },
    });

    if (!membership) throw new NotFoundException('You are not in that cohort.');
    if (membership.status === 'REMOVED') {
      throw new ForbiddenException('You are not in that cohort.');
    }

    return this.toView(membership.cohort, membership.status);
  }

  private toView(
    cohort: {
      id: string;
      status: string;
      neighborhood: string;
      ageBand: string;
      womenOnly: boolean;
      priceCents: number;
      promisedSize: number;
      promisedWomen: number;
      groupChatUrl: string | null;
      sessions: SessionView[];
      members: Array<{ status: string; user: { displayName: string | null } }>;
    },
    viewerStatus: string,
  ): CohortView {
    // Nobody sees who else is in the group until the cohort is confirmed and
    // they have paid. There is no browsable roster at any point in this API.
    const revealed = viewerStatus === 'PAID' || viewerStatus === 'ACTIVE';

    return {
      id: cohort.id,
      status: cohort.status,
      neighborhood: cohort.neighborhood,
      ageBand: cohort.ageBand,
      womenOnly: cohort.womenOnly,
      priceCents: cohort.priceCents,
      promised: { size: cohort.promisedSize, women: cohort.promisedWomen },
      // The chat link is handed over at graduation and not a moment sooner.
      groupChatUrl: cohort.status === 'GRADUATED' ? cohort.groupChatUrl : null,
      sessions: cohort.sessions,
      members: revealed
        ? cohort.members
            .filter((m) => m.status === 'PAID' || m.status === 'ACTIVE')
            .map((m) => ({ firstName: firstName(m.user.displayName) }))
        : [],
    };
  }
}
