// Covers bundled with the app (public/covers). Choosing one copies it into the image library,
// so the note keeps a normal Markdown image (ADR 0038) that syncs and exports like any other.
const item = (id) => ({ id, label: `cover.gallery.${id}` })

export const COVER_GALLERY = [
  {
    id: 'gradients',
    label: 'cover.group.gradients',
    items: [
      'gradiente-lavanda',
      'gradiente-menta',
      'gradiente-pessego',
      'gradiente-ceu',
      'gradiente-violeta',
      'gradiente-damasco',
      'gradiente-noite',
      'gradiente-nevoa',
    ].map(item),
  },
  {
    id: 'aurora',
    label: 'cover.group.aurora',
    items: [
      'aurora-rosa',
      'aurora-por-do-sol',
      'aurora-oceano',
      'aurora-orquidea',
      'aurora-limao',
      'aurora-brasa',
    ].map(item),
  },
  {
    id: 'mountains',
    label: 'cover.group.mountains',
    items: ['montanha-terracota', 'montanha-azul', 'montanha-verde', 'montanha-lilas'].map(item),
  },
]
