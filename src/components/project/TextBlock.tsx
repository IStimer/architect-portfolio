import type { TextBlockData } from '../../types/project';

interface TextBlockProps {
  block: TextBlockData;
}

export const TextBlock = ({ block }: TextBlockProps) => {
  const cls = [
    'text-block',
    `text-block--${block.style}`,
    `text-block--align-${block.alignment}`,
    `text-block--${block.maxWidth}`,
  ].join(' ');

  if (block.style === 'heading') {
    return (
      <div className={cls}>
        <h2>{block.text}</h2>
      </div>
    );
  }

  if (block.style === 'quote') {
    return (
      <blockquote className={cls}>
        <p>{block.text}</p>
      </blockquote>
    );
  }

  return (
    <div className={cls}>
      <p>{block.text}</p>
    </div>
  );
};
