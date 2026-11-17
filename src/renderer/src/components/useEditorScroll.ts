import { useLayoutEffect, useRef } from 'react';

/** .content owns vertical navigation, not window or the form body. */
export function useEditorScroll(id: string | undefined) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const editor = ref.current;
    const container = editor?.closest<HTMLElement>('.content');
    if (!id || !editor || !container) return;
    const top =
      container.scrollTop + editor.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [id]);
  return ref;
}
