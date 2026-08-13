-- The audit log must remain readable after the actor or target account is
-- deleted (DATA-02/DATA-04 spirit: history is preserved, not destroyed).
-- Without an explicit delete action these FKs default to RESTRICT, which
-- blocks deleting any user who ever appeared in the audit log at all.
alter table public.audit_log
  drop constraint audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.audit_log
  drop constraint audit_log_target_user_id_fkey,
  add constraint audit_log_target_user_id_fkey foreign key (target_user_id) references public.profiles(id) on delete set null;
