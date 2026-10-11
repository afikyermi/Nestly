-- T2 block A (nestly-preview only): can postgres grant `authenticated` the way platform rule 2 needs?
-- A throwaway role; dropped after T5.
create role probe_server login nobypassrls;
grant authenticated to probe_server with inherit false, set true;
