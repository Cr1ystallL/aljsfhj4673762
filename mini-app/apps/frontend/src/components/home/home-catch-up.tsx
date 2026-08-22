export interface CatchUpContest {
  title: string;
  endsAt: number;
  href: string;
}

export function HomeCatchUp(_props?: {
  contest?: CatchUpContest | null;
  hideContest?: boolean;
  onOpen?: (href: string) => void;
}) {
  return null;
}

