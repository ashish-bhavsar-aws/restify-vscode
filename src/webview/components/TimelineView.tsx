import styled from 'styled-components';
import {
  timingStages,
  isMeasuredTimings,
  ttfbOf,
  type RequestTimings,
} from '../../core/timings';

const STAGE_COLORS: Record<string, string> = {
  dns: '#4a9eff',
  connect: '#2ecc71',
  tls: '#a55eea',
  send: '#fd9644',
  wait: '#feca57',
  receive: '#26de81',
};

const TimelineContainer = styled.div`
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const TimelineBarTrack = styled.div`
  display: flex;
  height: 26px;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  background: color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
`;

const TimelineBarSegment = styled.div<{ $color: string; $width: number }>`
  width: ${({ $width }) => $width}%;
  background: ${({ $color }) => $color};
  min-width: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: width .2s ease;
`;

const TimelineStats = styled.div`
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
`;

const StatChip = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatValue = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.fg};
  font-variant-numeric: tabular-nums;
`;

const StatLabel = styled.div`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: ${({ theme }) => theme.muted};
`;

const TimelineTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const TimelineRow = styled.tr`
  &:not(:last-child) td {
    border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 50%, transparent);
  }
`;

const TimelineCell = styled.td`
  padding: 7px 6px;
  color: ${({ theme }) => theme.fg};
  font-variant-numeric: tabular-nums;
`;

const StageDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  margin-right: 7px;
  vertical-align: middle;
`;

const ContentPadding = styled.div`
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: auto;
`;

const EmptyHint = styled.div`
  padding: 24px 16px;
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
  text-align: center;
`;

export function TimelineView({
  timings,
  duration,
}: {
  timings?: RequestTimings | null;
  duration?: number;
}): JSX.Element {
  const stages = timingStages(timings);
  const measured = isMeasuredTimings(timings);
  const total = measured ? stages[stages.length - 1]?.offset || duration || 0 : duration || 0;

  if (!measured) {
    return (
      <ContentPadding>
        <EmptyHint>
          No timing data available for this response.
          {duration ? ` Total: ${duration.toFixed(0)} ms.` : ''}
          {' '}Timings are captured for live requests (timing details are not stored with saved responses).
        </EmptyHint>
      </ContentPadding>
    );
  }

  const ttfb = ttfbOf(timings);

  return (
    <TimelineContainer>
      <TimelineStats>
        <StatChip>
          <StatValue>{total.toFixed(0)} ms</StatValue>
          <StatLabel>Total</StatLabel>
        </StatChip>
        {ttfb > 0 && (
          <StatChip>
            <StatValue>{ttfb.toFixed(0)} ms</StatValue>
            <StatLabel>TTFB</StatLabel>
          </StatChip>
        )}
        {duration !== undefined && (
          <StatChip>
            <StatValue>{duration.toFixed(0)} ms</StatValue>
            <StatLabel>Wall Clock</StatLabel>
          </StatChip>
        )}
      </TimelineStats>

      <TimelineBarTrack title="Request timeline">
        {stages.map((s) => (
          <TimelineBarSegment
            key={s.id}
            $color={STAGE_COLORS[s.id] || '#888'}
            $width={total > 0 ? (s.duration / total) * 100 : 0}
            title={`${s.label}: ${s.duration.toFixed(2)} ms`}
          />
        ))}
      </TimelineBarTrack>

      <TimelineTable>
        <thead>
          <tr>
            <TimelineCell>Stage</TimelineCell>
            <TimelineCell>Offset</TimelineCell>
            <TimelineCell>Duration</TimelineCell>
            <TimelineCell>Share</TimelineCell>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <TimelineRow key={s.id}>
              <TimelineCell>
                <StageDot $color={STAGE_COLORS[s.id] || '#888'} />
                {s.label}
              </TimelineCell>
              <TimelineCell>{s.offset.toFixed(2)} ms</TimelineCell>
              <TimelineCell>{s.duration.toFixed(2)} ms</TimelineCell>
              <TimelineCell>{total > 0 ? `${((s.duration / total) * 100).toFixed(1)}%` : '—'}</TimelineCell>
            </TimelineRow>
          ))}
        </tbody>
      </TimelineTable>
    </TimelineContainer>
  );
}
