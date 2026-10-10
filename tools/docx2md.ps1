param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
# Converts a .docx to structured markdown: headings (by outline level / style), list items, top-level tables.
#
# Usage:   powershell -File tools/docx2md.ps1 -In srs/Nestly_SRS_v2.2_Final.docx -Out <path>.md
# Output:  a summary line — paragraphs, tables, unhandled body elements, sdt blocks, lines written.
#          "unhandled" and "sdt" must both be 0, otherwise content was skipped and the output is incomplete.
#
# Deterministic: the same .docx always yields a byte-identical .md (verified on SRS v2.2, 10.10.2026).
# Purpose: agents cannot read .docx; this produces the text they read. Whether its output is committed
# as an SRS mirror is pending decision D1 in WORKPLAN-HE.md.
# Dev tooling, not product code — the React/JavaScript iron rule governs the product. If a JavaScript
# version is preferred for consistency, that is part of D1.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
$zip = [System.IO.Compression.ZipFile]::OpenRead($In)
function Read-Entry($name) { $e = $zip.Entries | Where-Object { $_.FullName -eq $name }; if (-not $e) { return $null }; $r = New-Object System.IO.StreamReader($e.Open()); $t = $r.ReadToEnd(); $r.Close(); return $t }
$docXml = [xml](Read-Entry 'word/document.xml')
$stylesRaw = Read-Entry 'word/styles.xml'
$zip.Dispose()
$ns = New-Object System.Xml.XmlNamespaceManager($docXml.NameTable); $ns.AddNamespace('w',$W)

$styleName = @{}
if ($stylesRaw) {
  $sx = [xml]$stylesRaw; $sns = New-Object System.Xml.XmlNamespaceManager($sx.NameTable); $sns.AddNamespace('w',$W)
  foreach ($s in $sx.SelectNodes('//w:style',$sns)) {
    $id = $s.GetAttribute('styleId',$W)
    $n = $s.SelectSingleNode('w:name',$sns); if ($n) { $styleName[$id] = $n.GetAttribute('val',$W) }
    $ol = $s.SelectSingleNode('w:pPr/w:outlineLvl',$sns); if ($ol) { $styleName["$id::outline"] = [int]$ol.GetAttribute('val',$W) }
  }
}
function Get-ParaText($p) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($n in $p.SelectNodes('.//w:t | .//w:tab | .//w:br', $ns)) { if ($n.LocalName -eq 't') { [void]$sb.Append($n.InnerText) } else { [void]$sb.Append(' ') } }
  return $sb.ToString().Trim()
}
function Get-HeadingLevel($p) {
  $ol = $p.SelectSingleNode('w:pPr/w:outlineLvl',$ns); if ($ol) { return [int]$ol.GetAttribute('val',$W) + 1 }
  $ps = $p.SelectSingleNode('w:pPr/w:pStyle',$ns)
  if ($ps) {
    $id = $ps.GetAttribute('val',$W)
    if ($styleName.ContainsKey("$id::outline")) { return $styleName["$id::outline"] + 1 }
    $nm = if ($styleName.ContainsKey($id)) { $styleName[$id] } else { $id }
    if ($nm -match '(?i)^heading\s*(\d)') { return [int]$Matches[1] }
    if ($nm -match '(?i)^title$') { return 1 }
  }
  return 0
}
$lines = New-Object System.Collections.Generic.List[string]
$body = $docXml.SelectSingleNode('//w:body',$ns)
$counts = @{ p = 0; tbl = 0; other = 0 }
foreach ($child in $body.ChildNodes) {
  switch ($child.LocalName) {
    'p' {
      $counts.p++
      $t = Get-ParaText $child; if (-not $t) { continue }
      $lvl = Get-HeadingLevel $child
      if ($lvl -gt 0) { $lines.Add(''); $lines.Add(('#' * [Math]::Min($lvl,6)) + ' ' + $t); $lines.Add('') }
      elseif ($child.SelectSingleNode('w:pPr/w:numPr',$ns)) {
        $il = $child.SelectSingleNode('w:pPr/w:numPr/w:ilvl',$ns); $d = 0; if ($il) { $d = [int]$il.GetAttribute('val',$W) }
        $lines.Add(('  ' * $d) + '- ' + $t)
      } else { $lines.Add($t); $lines.Add('') }
    }
    'tbl' {
      $counts.tbl++
      $lines.Add(''); $rowIdx = 0
      foreach ($tr in $child.SelectNodes('w:tr',$ns)) {
        $cells = @()
        foreach ($tc in $tr.SelectNodes('w:tc',$ns)) { $parts = @(); foreach ($cp in $tc.SelectNodes('.//w:p',$ns)) { $x = Get-ParaText $cp; if ($x) { $parts += $x } }; $cells += (($parts -join ' <br> ') -replace '\|','/') }
        $lines.Add('| ' + ($cells -join ' | ') + ' |')
        if ($rowIdx -eq 0) { $lines.Add('|' + (($cells | ForEach-Object { '---' }) -join '|') + '|') }
        $rowIdx++
      }
      $lines.Add('')
    }
    'sectPr' { }
    default { $counts.other++ }
  }
}
[System.IO.File]::WriteAllLines($Out, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("paragraphs={0} tables={1} unhandled={2} sdt={3} lines={4}" -f $counts.p, $counts.tbl, $counts.other, $docXml.SelectNodes('//w:sdt',$ns).Count, $lines.Count)
