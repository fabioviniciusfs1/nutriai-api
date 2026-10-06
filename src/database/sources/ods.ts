// Leitor mínimo de planilhas .ods (OpenDocument): devolve o texto exibido de cada célula, por página.
import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';

/** Página da planilha: nome e linhas, cada uma com o texto exibido das células. */
export type OdsSheet = { name: string; rows: string[][] };

/** Nó do `fast-xml-parser` com `preserveOrder`: `{ tag: filhos, ':@': atributos }` ou `{ '#text': texto }`. */
type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const CELL_TAGS = new Set(['table:table-cell', 'table:covered-table-cell']);
/** Limite de repetição considerado (o ODS repete células vazias até o fim da planilha). */
const MAX_REPEAT = 1000;

function tagOf(node: XmlNode) {
  return Object.keys(node).find((key) => key !== ':@');
}

function children(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function findAll(nodes: XmlNode[], tag: string): XmlNode[] {
  return nodes.flatMap((node) =>
    tagOf(node) === tag ? [node] : findAll(children(node), tag),
  );
}

/** Texto de um nó, com `<text:s/>` (espaços) e `<text:tab/>`. */
function textOf(nodes: XmlNode[]): string {
  return nodes
    .map((node) => {
      const tag = tagOf(node);
      if (tag === '#text') return String(node['#text']);
      if (tag === 'text:s')
        return ' '.repeat(Number(node[':@']?.['text:c'] ?? 1));
      if (tag === 'text:tab') return '\t';
      return textOf(children(node));
    })
    .join('');
}

function repeat(node: XmlNode, attribute: string) {
  return Math.min(Number(node[':@']?.[attribute] ?? 1), MAX_REPEAT);
}

/** Lê as páginas de um arquivo .ods. Linhas vazias e células vazias no fim da linha são descartadas. */
export function readOds(file: Uint8Array): OdsSheet[] {
  const files = unzipSync(file, {
    filter: (entry) => entry.name === 'content.xml',
  });
  const content = files['content.xml'];
  if (!content)
    throw new Error('Arquivo .ods inválido: content.xml não encontrado.');

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  const document = parser.parse(strFromU8(content)) as XmlNode[];

  return findAll(document, 'table:table').map((table) => {
    const rows: string[][] = [];
    for (const row of findAll(children(table), 'table:table-row')) {
      const cells: string[] = [];
      for (const cell of children(row)) {
        const tag = tagOf(cell);
        if (!tag || !CELL_TAGS.has(tag)) continue;
        const text = findAll(children(cell), 'text:p')
          .map((paragraph) => textOf(children(paragraph)))
          .join(' ');
        for (let i = 0; i < repeat(cell, 'table:number-columns-repeated'); i++)
          cells.push(text);
      }
      while (cells.length > 0 && cells[cells.length - 1].trim() === '')
        cells.pop();
      if (cells.length > 0) rows.push(cells);
    }
    return { name: table[':@']?.['table:name'] ?? '', rows };
  });
}
