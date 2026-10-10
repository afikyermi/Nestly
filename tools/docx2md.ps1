param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
# Converts a .docx to structured markdown: headings (by outline level / style), list items, top-level tables.
#
# Usage:   powershell -File tools/docx2md.ps1 -In <file>.docx -Out <file>.md
# Output:  a summary line — paragraphs, tables, unhandled body elements, sdt blocks, lines written.
#          "unhandled" and "sdt" must both be 0, otherwise content was skipped and the output is incomplete.
#
# Rendering rules:
#   - Heading1..6 / outline level  -> '#' .. '######'
#   - numbered paragraphs and List* styles (e.g. ListBullet) -> '- ' bullet, indented by level
#   - a paragraph whose runs are all bold -> '**text**'
#   - a single-cell table (a callout box) -> blockquote
#   - any other table -> GFM table; first row is the header; '|' inside a cell is escaped as '\|'
#   - page breaks are dropped; other line breaks become a space
#
# Deterministic: the same .docx always yields a byte-identical .md.
# History: used on 10.10.2026 to migrate SRS v2.2 from Word into docs/srs/ (markdown is now the master).
# Kept for any future .docx input. Dev tooling, not product code — the React/JavaScript iron rule governs the product.
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
function Get-StyleName($p) {
  $ps = $p.SelectSingleNode('w:pPr/w:pStyle',$ns); if (-not $ps) { return '' }
  $id = $ps.GetAttribute('val',$W); if ($styleName.ContainsKey($id)) { return $styleName[$id] } else { return $id }
}
function Test-Bold($run) {
  $b = $run.SelectSingleNode('w:rPr/w:b',$ns); if (-not $b) { return $false }
  $v = $b.GetAttribute('val',$W); return ($v -eq '' -or $v -eq '1' -or $v -eq 'true' -or $v -eq 'on')
}
function Get-ParaText($p) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($n in $p.SelectNodes('.//w:t | .//w:tab | .//w:br', $ns)) {
    switch ($n.LocalName) {
      't'   { [void]$sb.Append($n.InnerText) }
      'tab' { [void]$sb.Append(' ') }
      'br'  { if ($n.GetAttribute('type',$W) -ne 'page') { [void]$sb.Append(' ') } }
    }
  }
  return $sb.ToString().Trim()
}
function Test-AllBold($p) {
  $textRuns = @($p.SelectNodes('.//w:r[w:t]',$ns) | Where-Object { ($_.SelectNodes('w:t',$ns) | ForEach-Object { $_.InnerText }) -join '' -match '\S' })
  if ($textRuns.Count -eq 0) { return $false }
  foreach ($r in $textRuns) { if (-not (Test-Bold $r)) { return $false } }
  return $true
}
function Get-HeadingLevel($p) {
  $ol = $p.SelectSingleNode('w:pPr/w:outlineLvl',$ns); if ($ol) { return [int]$ol.GetAttribute('val',$W) + 1 }
  $ps = $p.SelectSingleNode('w:pPr/w:pStyle',$ns)
  if ($ps) {
    $id = $ps.GetAttribute('val',$W)
    if ($styleName.ContainsKey("$id::outline")) { return $styleName["$id::outline"] + 1 }
    $nm = Get-StyleName $p
    if ($nm -match '(?i)^heading\s*(\d)') { return [int]$Matches[1] }
    if ($nm -match '(?i)^title$') { return 1 }
  }
  return 0
}
function Get-ListDepth($p) {
  # returns -1 when the paragraph is not a list item
  $il = $p.SelectSingleNode('w:pPr/w:numPr/w:ilvl',$ns)
  if ($p.SelectSingleNode('w:pPr/w:numPr',$ns)) { if ($il) { return [int]$il.GetAttribute('val',$W) } else { return 0 } }
  if ((Get-StyleName $p) -match '(?i)^list\s*(bullet|number|paragraph)\s*(\d)?') { if ($Matches[2]) { return [int]$Matches[2] - 1 } else { return 0 } }
  return -1
}
function Get-CellParas($tc) { $parts = @(); foreach ($cp in $tc.SelectNodes('.//w:p',$ns)) { $x = Get-ParaText $cp; if ($x) { $parts += $x } }; return ,$parts }

$lines = New-Object System.Collections.Generic.List[string]
function Add-Blank { if ($lines.Count -gt 0 -and $lines[$lines.Count-1] -ne '') { $lines.Add('') } }
$body = $docXml.SelectSingleNode('//w:body',$ns)
$counts = @{ p = 0; tbl = 0; other = 0 }
foreach ($child in $body.ChildNodes) {
  switch ($child.LocalName) {
    'p' {
      $counts.p++
      $t = Get-ParaText $child; if (-not $t) { continue }
      $lvl = Get-HeadingLevel $child
      $depth = Get-ListDepth $child
      if ($lvl -gt 0) { Add-Blank; $lines.Add(('#' * [Math]::Min($lvl,6)) + ' ' + $t); $lines.Add('') }
      elseif ($depth -ge 0) {
        # a list starts after a blank line, and consecutive items stay together
        if ($lines.Count -gt 0 -and $lines[$lines.Count-1] -ne '' -and $lines[$lines.Count-1] -notmatch '^\s*- ') { $lines.Add('') }
        $lines.Add(('  ' * $depth) + '- ' + $t)
      }
      else {
        Add-Blank   # also ends a preceding list, so this paragraph is not swallowed into it
        if (Test-AllBold $child) { $lines.Add("**$t**") } else { $lines.Add($t) }
        $lines.Add('')
      }
    }
    'tbl' {
      $counts.tbl++
      Add-Blank
      $rows = $child.SelectNodes('w:tr',$ns)
      $isCallout = ($rows.Count -eq 1 -and $rows[0].SelectNodes('w:tc',$ns).Count -eq 1)
      if ($isCallout) {
        $paras = Get-CellParas ($rows[0].SelectSingleNode('w:tc',$ns))
        for ($i = 0; $i -lt $paras.Count; $i++) { if ($i -gt 0) { $lines.Add('>') }; $lines.Add('> ' + $paras[$i]) }
        $lines.Add('')
      } else {
        $rowIdx = 0
        foreach ($tr in $rows) {
          $cells = @()
          foreach ($tc in $tr.SelectNodes('w:tc',$ns)) { $cells += ((Get-CellParas $tc) -join ' <br> ') -replace '\|','\|' }
          $lines.Add('| ' + ($cells -join ' | ') + ' |')
          if ($rowIdx -eq 0) { $lines.Add('|' + (($cells | ForEach-Object { '---' }) -join '|') + '|') }
          $rowIdx++
        }
        $lines.Add('')
      }
    }
    'sectPr' { }
    default { $counts.other++ }
  }
}
while ($lines.Count -gt 0 -and $lines[$lines.Count-1] -eq '') { $lines.RemoveAt($lines.Count-1) }
[System.IO.File]::WriteAllLines($Out, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("paragraphs={0} tables={1} unhandled={2} sdt={3} lines={4}" -f $counts.p, $counts.tbl, $counts.other, $docXml.SelectNodes('//w:sdt',$ns).Count, $lines.Count)
