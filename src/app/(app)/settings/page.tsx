import { getScoringConfig } from "@/lib/scoring";
import { aiConfigured, AI_MODEL } from "@/lib/ai";
import { PageHeader } from "@/components/bits";
import { ScoringForm } from "@/components/scoring-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = await getScoringConfig();

  const integrations = [
    { name: "Google Places API", ok: Boolean(process.env.GOOGLE_PLACES_API_KEY), env: "GOOGLE_PLACES_API_KEY" },
    { name: `Anthropic (${AI_MODEL})`, ok: aiConfigured(), env: "ANTHROPIC_API_KEY" },
    { name: "Database", ok: Boolean(process.env.DATABASE_URL), env: "DATABASE_URL" },
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Scoring rules, thresholds and integrations" />

      <div className="space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {integrations.map((i) => (
              <div key={i.env} className="flex items-center justify-between text-xs">
                <span>{i.name}</span>
                <span className={i.ok ? "text-emerald-400" : "text-amber-400"}>
                  {i.ok ? "configured" : `set ${i.env} in .env`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <ScoringForm
          initial={{
            noWebsite: cfg.noWebsite,
            websiteProblems: cfg.websiteProblems,
            instagramActive: cfg.instagramActive,
            instagramFollowers: cfg.instagramFollowers,
            manyReviews: cfg.manyReviews,
            highRating: cfg.highRating,
            premiumNeighborhood: cfg.premiumNeighborhood,
            appointmentBased: cfg.appointmentBased,
            followerThreshold: cfg.followerThreshold,
            reviewThreshold: cfg.reviewThreshold,
            ratingThreshold: cfg.ratingThreshold,
            hotMin: cfg.hotMin,
            goodMin: cfg.goodMin,
            maybeMin: cfg.maybeMin,
            premiumNeighborhoods: cfg.premiumNeighborhoods,
            appointmentTypes: cfg.appointmentTypes,
            followUpDays: cfg.followUpDays,
          }}
        />
      </div>
    </div>
  );
}
