<?php

namespace App\Http\Controllers\Concerns;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

trait GeneratesExport
{
    /**
     * Stream a CSV download.
     *
     * @param  string    $filename   e.g. "orders_MyStore_2026-01-01_to_2026-01-31.csv"
     * @param  array     $headings   Column header labels
     * @param  iterable  $rows       Each row is a flat array matching $headings order
     */
    protected function csvResponse(string $filename, array $headings, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headings, $rows) {
            $out = fopen('php://output', 'w');
            // UTF-8 BOM so Excel opens Philippine characters correctly
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $headings);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    /**
     * Render an HTML Blade view to PDF and return as inline/download response.
     *
     * @param  string  $filename
     * @param  array   $viewData  Passed to exports/table.blade.php
     */
    protected function pdfResponse(string $filename, array $viewData): Response
    {
        $html = view('exports.table', $viewData)->render();

        $options = new Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('defaultPaperSize', 'A4');
        $options->set('defaultPaperOrientation', 'landscape');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();

        $output = $dompdf->output();

        return response()->make($output, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => "inline; filename=\"{$filename}\"",
        ]);
    }

    /**
     * Format a PHP float as ₱1,600.00
     */
    protected function peso(float $amount): string
    {
        return '₱' . number_format($amount, 2);
    }

    /**
     * Build a safe export filename.
     * e.g. exportFilename('orders', 'My Store', '2026-01-01', '2026-01-31', 'csv')
     */
    protected function exportFilename(string $page, string $context, string $from, string $to, string $ext): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $context);
        return "{$page}_{$safe}_{$from}_to_{$to}.{$ext}";
    }
}
