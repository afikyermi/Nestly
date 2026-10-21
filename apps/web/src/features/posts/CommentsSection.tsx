import { useStaffAccess } from '@/hooks/use-staff-access';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { PATHS } from '@/app/paths';
import { useBackCloses } from '@/hooks/use-back-closes';
import type { PostingRight } from '@/hooks/use-posting-right';
import { reportSheetProps, useReport, type ReportResult } from '@/hooks/use-report';
import { ALREADY_REPORTED_STATUS, REPORT_RECEIVED_STATUS, REPORT_UNAVAILABLE_STATUS } from '@/lib/report-texts';
import { CommentsView } from './CommentsView';
import { outsidePressHandler } from './outside-press';
import { useCommentApi } from './use-comment-api';
import { useCommentWrites } from './use-comment-writes';
import { useComments } from './use-comments';

export interface CommentsSectionProps {
  postId: string;
  /** The post's own like, as it was read. */
  liked: boolean;
  likes: number;
  /** The caller is the real author of this anonymous post (`isAnonymous` and `isMine`): the comment boxes say "המחבר" (F3.4 c14). */
  asAnonymousAuthor?: boolean;
  /** The viewer's posting right, read once by the post page. */
  right: PostingRight;
}

/** F3.7 c13: a comment report changes nothing on the screen (Afik 18.10): what happened is said, and focus goes back to the "⋯". */
export const COMMENT_REPORT_STATUS: Record<ReportResult, string> = {
  received: REPORT_RECEIVED_STATUS,
  'already-reported': ALREADY_REPORTED_STATUS,
  unavailable: REPORT_UNAVAILABLE_STATUS,
};

// The comments under one post (F3.3 w1): the thread, the writes and the likes of the post page, composed. The post page keys it by the
// post, so another post starts from nothing. A Professional (no parent profile, D1) gets the region without the name notice: their name is
// not shown (DR-3). The check is presentation only, the server and RLS refuse whatever this shows.
export function CommentsSection({ right, ...props }: CommentsSectionProps) {
  return right === 'checking' ? null : <CommentsRegion {...props} namesWriter={right !== 'everyone-only'} />;
}

// F3.7: every comment's "⋯" (own: delete, opening F3.3's confirmation; anyone else's: report) and the report window. Back closes whichever
// of the menu, the confirmation or the window is open, and stays on the post (direction.md); a request in flight keeps its dialog.
function CommentsRegion({ postId, liked, likes, asAnonymousAuthor = false, namesWriter }: Omit<CommentsSectionProps, 'right'> & { namesWriter: boolean }) {
  const api = useCommentApi();
  // I14 completion (§9.7): a staff account reads the thread for review and writes nothing
  const reviewing = useStaffAccess().kind === 'staff';
  const flow = useComments(postId, { liked, likes }, api);
  const writes = useCommentWrites(postId, flow, api);
  const { hash } = useLocation();
  const [menuId, setMenuId] = useState<string | null>(null);
  const report = useReport((_target, result) => flow.setThread((current) => ({ ...current, status: COMMENT_REPORT_STATUS[result] })));
  // Back while a delete or a report is in flight keeps its dialog (the hook adds its entry again). A press outside a menu: as the feed's.
  const back = useBackCloses(menuId !== null || writes.confirm !== null || report.draft !== null, () => {
    if (writes.confirm?.saving === true || report.draft?.sending === true) return false;
    setMenuId(null);
    writes.cancelDelete();
    report.cancel();
    return true;
  });
  const pressedOutside = outsidePressHandler(back);
  return (
    <CommentsView
      flow={flow}
      writes={writes}
      landOnHeading={hash === '#comments'}
      asAnonymousAuthor={asAnonymousAuthor}
      namesWriter={namesWriter}
      readOnly={reviewing}
      menu={{
        openId: menuId,
        onPressOutside: pressedOutside,
        onOpenChange: (commentId, open) => setMenuId((now) => (open ? commentId : now === commentId ? null : now)),
        onReport: (commentId) => {
          flow.setThread((current) => ({ ...current, status: '' }));
          report.start({ kind: 'comment', id: commentId });
        },
      }}
      report={report.draft === null ? null : { commentId: report.draft.target.id, sheet: reportSheetProps(report, report.draft, PATHS.communityRules) }}
    />
  );
}
