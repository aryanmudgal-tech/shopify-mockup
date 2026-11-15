import { useId } from "react";

// A fabric swatch with a pinked edge, the zigzag that pinking shears leave.
// With no image it draws the same outline dashed: the sample that isn't there.

const SIZE = 64;
const TEETH = 8;
const DEPTH = 2.5;

function pinkedPath(): string {
  const step = SIZE / TEETH;
  const pts: [number, number][] = [];
  for (let i = 0; i < TEETH; i++) pts.push([i * step, 0], [i * step + step / 2, DEPTH]);
  for (let i = 0; i < TEETH; i++) pts.push([SIZE, i * step], [SIZE - DEPTH, i * step + step / 2]);
  for (let i = 0; i < TEETH; i++) pts.push([SIZE - i * step, SIZE], [SIZE - i * step - step / 2, SIZE - DEPTH]);
  for (let i = 0; i < TEETH; i++) pts.push([0, SIZE - i * step], [DEPTH, SIZE - i * step - step / 2]);
  return `M${pts.map(([x, y]) => `${x},${y}`).join("L")}Z`;
}

const PATH = pinkedPath();

export function Swatch({ imageUrl }: { imageUrl: string | null }) {
  const id = useId();
  return (
    <svg className="swatch" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      {imageUrl ? (
        <>
          <defs>
            <clipPath id={id}>
              <path d={PATH} />
            </clipPath>
          </defs>
          <image
            href={imageUrl}
            width={SIZE}
            height={SIZE}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${id})`}
          />
        </>
      ) : (
        <path className="swatch-empty" d={PATH} />
      )}
    </svg>
  );
}
