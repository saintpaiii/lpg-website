<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 10px; color: #1a1a1a; background: #fff; }

  .header { border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .org-name { font-size: 15px; font-weight: bold; color: #1e40af; }
  .org-sub  { font-size: 9px; color: #6b7280; margin-top: 2px; }
  .report-title { font-size: 13px; font-weight: bold; color: #111827; margin-top: 8px; }
  .meta { margin-top: 4px; font-size: 9px; color: #6b7280; }

  .summary-box { background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 4px; padding: 8px 12px; margin-bottom: 14px; display: flex; gap: 30px; flex-wrap: wrap; }
  .summary-item .label { font-size: 8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-item .value { font-size: 11px; font-weight: bold; color: #1e40af; margin-top: 1px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead tr { background: #1e40af; color: #fff; }
  thead th { padding: 5px 7px; text-align: left; font-size: 8.5px; font-weight: bold; letter-spacing: 0.3px; white-space: nowrap; }
  thead th.right { text-align: right; }
  tbody tr:nth-child(even) { background: #f8faff; }
  tbody tr:hover { background: #eff6ff; }
  tbody td { padding: 4px 7px; font-size: 9px; border-bottom: 1px solid #e5e7eb; }
  tbody td.right { text-align: right; }
  tbody td.mono  { font-family: Courier New, monospace; font-size: 8.5px; }
  tbody td.badge { }

  .totals-row td { background: #dbeafe; font-weight: bold; font-size: 9.5px; border-top: 2px solid #1e40af; }

  .footer { margin-top: 14px; border-top: 1px solid #e5e7eb; padding-top: 6px; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; }
  .empty { text-align: center; padding: 24px; color: #9ca3af; font-style: italic; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="org-name">{{ $orgName }}</div>
      <div class="org-sub">{{ $orgSub ?? 'Cavite, Philippines' }}</div>
    </div>
    <div style="text-align:right; font-size:9px; color:#6b7280;">
      Generated: {{ now()->setTimezone('Asia/Manila')->format('M d, Y g:i A') }}<br>
      {{ $dateRange }}
    </div>
  </div>
  <div class="report-title">{{ $title }}</div>
  @if(!empty($subtitle))
  <div class="meta">{{ $subtitle }}</div>
  @endif
</div>

@if(!empty($summaryItems))
<div class="summary-box">
  @foreach($summaryItems as $item)
  <div class="summary-item">
    <div class="label">{{ $item['label'] }}</div>
    <div class="value">{{ $item['value'] }}</div>
  </div>
  @endforeach
</div>
@endif

@if(empty($rows))
<div class="empty">No records found for the selected filters.</div>
@else
<table>
  <thead>
    <tr>
      @foreach($columns as $col)
      <th class="{{ $col['align'] ?? '' }}">{{ $col['label'] }}</th>
      @endforeach
    </tr>
  </thead>
  <tbody>
    @foreach($rows as $row)
    <tr>
      @foreach($columns as $col)
      <td class="{{ $col['align'] ?? '' }} {{ $col['class'] ?? '' }}">{{ $row[$col['key']] ?? '' }}</td>
      @endforeach
    </tr>
    @endforeach

    @if(!empty($totalsRow))
    <tr class="totals-row">
      @foreach($columns as $col)
      <td class="{{ $col['align'] ?? '' }}">{{ $totalsRow[$col['key']] ?? '' }}</td>
      @endforeach
    </tr>
    @endif
  </tbody>
</table>
@endif

<div class="footer">
  <span>{{ $title }} — {{ $orgName }}</span>
  <span>Total: {{ count($rows ?? []) }} record(s)</span>
</div>

</body>
</html>
