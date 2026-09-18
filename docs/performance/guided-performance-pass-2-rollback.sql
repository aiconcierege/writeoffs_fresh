-- Dedicated staging only. Restore application 2baaa00 before removing its successor's RPC.
-- This removes only the additive read function; no facts/history are altered.
begin;
drop function if exists public.read_betti_work_inputs(uuid,timestamptz);
commit;
