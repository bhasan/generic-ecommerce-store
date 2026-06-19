const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const projectDesignPath = path.join(root, 'docs', 'PROJECT_DESIGN.md');
const tempDir = path.join(root, '.tmp-mermaid-render');
const diagramsDir = path.join(root, 'docs', 'design-assets', 'diagrams');
const manifestPath = path.join(diagramsDir, 'manifest.json');

function cleanHeading(raw) {
  return raw
    .replace(/^#+\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
}

function slugify(value) {
  return cleanHeading(value)
    .replace(/^Flow:\s*/i, 'flow-')
    .replace(/^Endpoint Group:\s*/i, 'endpoint-group-')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function uniqueName(base, used) {
  let candidate = base || 'diagram';
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function findHeadingBefore(markdown, index) {
  const before = markdown.slice(0, index);
  const headingPattern = /^#{1,6}\s+(.+)$/gm;
  let match;
  let last = { index: 0, text: 'Diagram' };

  while ((match = headingPattern.exec(before)) !== null) {
    last = { index: match.index, text: cleanHeading(match[1]) };
  }

  return last;
}

function findExistingImage(segment) {
  const imagePattern = /!\[([^\]]*)\]\((design-assets\/diagrams\/[^)]+\.svg)\)/g;
  let match;
  let last = null;

  while ((match = imagePattern.exec(segment)) !== null) {
    last = { alt: match[1], relPath: match[2] };
  }

  return last;
}

function extractBlocks(markdown) {
  const pattern = /```mermaid\r?\n([\s\S]*?)\r?\n```/g;
  const blocks = [];
  const usedSlugs = new Set();
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    const heading = findHeadingBefore(markdown, match.index);
    const sectionBeforeBlock = markdown.slice(heading.index, match.index);
    const existingImage = findExistingImage(sectionBeforeBlock);
    const baseSlug = existingImage
      ? path.basename(existingImage.relPath, '.svg')
      : uniqueName(slugify(heading.text), usedSlugs);

    if (existingImage) {
      usedSlugs.add(baseSlug);
    }

    blocks.push({
      index: blocks.length + 1,
      start: match.index,
      end: pattern.lastIndex,
      body: match[1].trimEnd() + '\n',
      heading: existingImage ? existingImage.alt : heading.text,
      slug: baseSlug,
      alt: existingImage ? existingImage.alt : heading.text,
      svgRelPath: existingImage ? existingImage.relPath : `design-assets/diagrams/${baseSlug}.svg`,
    });
  }

  return blocks;
}

function ensureImageReferences(markdown, blocks) {
  let updated = markdown;

  for (const block of [...blocks].reverse()) {
    const beforeBlock = updated.slice(0, block.start);
    const heading = findHeadingBefore(updated, block.start);
    const sectionBeforeBlock = updated.slice(heading.index, block.start);

    if (sectionBeforeBlock.includes(`](${block.svgRelPath})`)) {
      continue;
    }

    const imageRef = `![${block.alt}](${block.svgRelPath})\n\n`;
    updated = beforeBlock + imageRef + updated.slice(block.start);
  }

  return updated;
}

function renderBlock(block) {
  const sourcePath = path.join(tempDir, `${String(block.index).padStart(2, '0')}-${block.slug}.mmd`);
  const outputPath = path.join(root, 'docs', block.svgRelPath.replace(/\//g, path.sep));
  const sourceRel = path.relative(root, sourcePath);
  const outputRel = path.relative(root, outputPath);
  fs.writeFileSync(sourcePath, block.body, 'utf8');

  const args = ['-y', '@mermaid-js/mermaid-cli@latest', '-i', sourcePath, '-o', outputPath];
  const winCommand = `npx.cmd -y @mermaid-js/mermaid-cli@latest -i ${sourceRel} -o ${outputRel}`;
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', winCommand], {
        cwd: root,
        stdio: 'inherit',
      })
    : spawnSync('npx', args, {
        cwd: root,
        stdio: 'inherit',
      });

  return {
    ...block,
    source: path.relative(root, sourcePath).replace(/\\/g, '/'),
    svg: block.svgRelPath,
    status: result.status === 0 ? 'rendered' : 'failed',
    exitCode: result.status,
    error: result.error ? result.error.message : undefined,
  };
}

function main() {
  if (!fs.existsSync(projectDesignPath)) {
    console.error('Missing docs/PROJECT_DESIGN.md');
    process.exit(1);
  }

  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(diagramsDir, { recursive: true });

  const markdown = fs.readFileSync(projectDesignPath, 'utf8');
  const blocks = extractBlocks(markdown);

  if (blocks.length === 0) {
    console.error('No Mermaid blocks found in docs/PROJECT_DESIGN.md');
    process.exit(1);
  }

  const rendered = [];
  let failed = false;

  try {
    for (const block of blocks) {
      console.log(`Rendering ${block.svgRelPath}`);
      const result = renderBlock(block);
      rendered.push(result);
      if (result.status !== 'rendered') {
        failed = true;
      }
    }

    const updatedMarkdown = ensureImageReferences(markdown, blocks);
    if (updatedMarkdown !== markdown) {
      fs.writeFileSync(projectDesignPath, updatedMarkdown, 'utf8');
      console.log('Inserted missing Mermaid SVG image references.');
    } else {
      console.log('All Mermaid SVG image references already present.');
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      source: 'docs/PROJECT_DESIGN.md',
      outputDirectory: 'docs/design-assets/diagrams',
      renderer: '@mermaid-js/mermaid-cli via npx',
      diagrams: rendered.map(({ index, heading, source, svg, status, exitCode, error }) => ({
        index,
        heading,
        source,
        svg,
        status,
        exitCode,
        ...(error ? { error } : {}),
      })),
    };

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } finally {
    if (!process.env.KEEP_MERMAID_TMP) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  if (failed) {
    console.error('One or more Mermaid diagrams failed to render.');
    process.exit(1);
  }

  console.log(`Rendered ${rendered.length} Mermaid diagrams.`);
}

main();
