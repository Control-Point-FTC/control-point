// Modern Team Stats (phases 7b–7c), rebuilt on the shadcn kit: Compete is our
// team's season (TeamProfile); Analyze is the scouting workspace (event
// field, any team, the shortlist). Mode, season and the Compete → Analyze
// hand-off come from the shared useTeamStats.
import { Search, Trophy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui-kit';
import { useTeamStats, type TeamStatsMode } from '../../../components/scout/useTeamStats';
import { Page, PageHeader } from '../../ui/page';
import { TeamProfile } from './TeamProfile';
import { AnalyzeWorkspace } from './AnalyzeWorkspace';

export function TeamStatsPage() {
  const ts = useTeamStats();
  return (
    <Page>
      <PageHeader
        eyebrow="Compete"
        title="Team Stats"
        description={ts.mode === 'compete' ? 'Your season: OPR, trends, every event and match.' : 'Scout an event field, build a pick list and dig into any team.'}
      >
        <Tabs value={ts.mode} onValueChange={(v) => ts.setMode(v as TeamStatsMode)}>
          <TabsList aria-label="Team stats mode">
            <TabsTrigger value="compete" className="max-sm:h-11"><Trophy /> Compete</TabsTrigger>
            <TabsTrigger value="analyze" className="max-sm:h-11"><Search /> Analyze</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>
      {ts.mode === 'compete' ? (
        <TeamProfile number={null} season={ts.season} onSeasonChange={ts.setSeason} autoSeason actions={{ onViewTeam: ts.viewTeam }} />
      ) : (
        <AnalyzeWorkspace key={ts.focusTeam?.number ?? 'none'} season={ts.season} onSeasonChange={ts.setSeason} myTeam={ts.myTeam} initialTeam={ts.focusTeam} />
      )}
    </Page>
  );
}
