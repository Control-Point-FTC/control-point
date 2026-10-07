// One "Export" menu for list pages (owner list: exports, CSV and printable):
// download the data as CSV, or print the page (the browser's dialog also
// saves as PDF). Printing uses the print stylesheet in modern.css: the app
// chrome is hidden and the page prints on white, in the light theme.
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui-kit';

export function printPage() {
  window.print();
}

export function ExportMenu({ onCsv, disabled, size, className }: { onCsv: () => void; disabled?: boolean; size?: 'sm' | 'default'; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled} className={className} data-print-hide><Download /> Export</Button>
      </DropdownMenuTrigger>
      {/* Portalled to <body>, so it needs its own print-hide. */}
      <DropdownMenuContent align="end" data-print-hide>
        <DropdownMenuItem onSelect={onCsv}><FileSpreadsheet /> Download CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={printPage}><Printer /> Print or save as PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** While printing, use the light theme (dark text on white paper), then
 *  put the reader's theme back. */
export function installPrintTheme(): () => void {
  let added = false;
  const before = () => {
    const root = document.documentElement;
    added = !root.classList.contains('light');
    if (added) root.classList.add('light');
  };
  const after = () => {
    if (added) document.documentElement.classList.remove('light');
    added = false;
  };
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  return () => {
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
    after();
  };
}
