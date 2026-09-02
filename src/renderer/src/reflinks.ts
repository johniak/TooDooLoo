// Auto-linki w notatkach: #1 → todos, AB#123 → Azure Boards, GH#123 → GitHub.
// Dekoracje ProseMirror — markdown na dysku zostaje czystym tekstem.
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'

export type RefBases = { azureBase: string; githubBase: string }

const PATTERNS = [
  { re: /\[\[([^\[\]\n]+)\]\]/g, type: 'note' }, // wiki-link do notatki po tytule
  { re: /AB#(\d+)/g, type: 'ab' },
  { re: /GH#(\d+)/g, type: 'gh' },
  { re: /(?<![\w#])#(\d+)/g, type: 'todo' } // lookbehind pomija środek AB#/GH#
]

const joinUrl = (base: string, tail: string): string => `${base.replace(/\/+$/, '')}/${tail}`

function decorate(doc: Node): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const { re, type } of PATTERNS) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(node.text))) {
        const from = pos + m.index
        decos.push(
          Decoration.inline(from, from + m[0].length, {
            class: `ref-link ref-${type}`,
            'data-ref': type,
            'data-val': m[1]
          })
        )
      }
    }
  })
  return DecorationSet.create(doc, decos)
}

export function refLinks(bases: RefBases, parentId?: string): Extension {
  return Extension.create({
    name: 'refLinks',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: (state) => decorate(state.doc),
            handleClick: (_view, _pos, event) => {
              const el = (event.target as HTMLElement).closest?.('.ref-link') as HTMLElement | null
              if (!el) return false
              const val = el.dataset.val!
              if (el.dataset.ref === 'todo') {
                // App nasłuchuje i przełącza na dzień todosa — bez wiercenia propsów przez edytory
                window.dispatchEvent(new CustomEvent('open-todo-num', { detail: Number(val) }))
              } else if (el.dataset.ref === 'note') {
                // otwiera notatkę po tytule; nieistniejącą App tworzy jako podstronę bieżącej
                window.dispatchEvent(
                  new CustomEvent('open-note-title', { detail: { title: val, parentId } })
                )
              } else if (el.dataset.ref === 'ab' && bases.azureBase) {
                window.open(joinUrl(bases.azureBase, val))
              } else if (el.dataset.ref === 'gh' && bases.githubBase) {
                window.open(joinUrl(bases.githubBase, `issues/${val}`)) // GitHub przekierowuje issues→pull
              }
              return true
            }
          }
        })
      ]
    }
  })
}
