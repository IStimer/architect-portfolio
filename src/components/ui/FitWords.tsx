import { useMemo } from 'react';

interface FitWordsProps {
  text: string;
  className: string;
  splitWords?: boolean;
}

const FitWords = ({ text, className, splitWords = true }: FitWordsProps) => {
  const items = useMemo(() => {
    if (!splitWords) return [{ key: text, word: text, charCount: text.length }];

    const words = text.split(/\s+/);
    const maxLen = Math.max(...words.map(w => w.length));
    const seen = new Map<string, number>();

    return words.map(word => {
      const count = seen.get(word) ?? 0;
      seen.set(word, count + 1);
      return { key: count > 0 ? `${word}-${count}` : word, word, charCount: maxLen };
    });
  }, [text, splitWords]);

  return items.map(({ key, word, charCount }) => (
    <span
      key={key}
      className={className}
      style={{ '--char-count': charCount } as React.CSSProperties}
    >
      {word}
    </span>
  ));
};

export default FitWords;
