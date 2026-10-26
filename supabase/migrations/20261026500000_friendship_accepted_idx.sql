-- =====================================================================================================================
-- Performance plan item M: two partial indexes on nestly.friendships for the accepted Friends only — migration only, no data change.
--
-- Why. The feed ranking and every "is a Friend of" check read the accepted rows of one person in both directions. The existing
--      friendships_requester_id_idx / friendships_addressee_id_idx cover every status, and friendships_pair_live_key is on
--      least()/greatest() of the pair, so none of them serves an index-only lookup of (me, friend) over accepted rows. These two are small
--      (accepted rows only) and let that lookup be answered from the index. No existing index is equivalent; nothing is dropped.
-- =====================================================================================================================

create index friendships_requester_id_addressee_id_accepted_idx on nestly.friendships (requester_id, addressee_id)
  where status = 'accepted';
create index friendships_addressee_id_requester_id_accepted_idx on nestly.friendships (addressee_id, requester_id)
  where status = 'accepted';

comment on index nestly.friendships_requester_id_addressee_id_accepted_idx is
  'Accepted Friends of a person who sent the request: (requester, addressee) over status = accepted only. Serves the feed ranking and Friend checks; the pair-unique index is on least/greatest and cannot.';
comment on index nestly.friendships_addressee_id_requester_id_accepted_idx is
  'Accepted Friends of a person who received the request: (addressee, requester) over status = accepted only. Mirror of the requester-side index.';
