import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import {
  Input,
  Select,
  Btn,
  IconBtn,
  SectionLabel,
  Th,
  Td,
  TableRow,
  EmptyRow,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import type { CustomRecord, DnsRecordType } from "@/api/types";

const TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME"];
const TYPE_COLOR: Record<DnsRecordType, string> = {
  A: "text-cached",
  AAAA: "text-upstream",
  CNAME: "text-warn",
};

interface CustomRecordForm {
  domain: string;
  type: DnsRecordType;
  value: string;
  ttl: string;
}

const EMPTY: CustomRecordForm = { domain: "", type: "A", value: "", ttl: "300" };

export default function CustomDNS() {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [records, setRecords] = useState<CustomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [removing, setRemoving] = useState("");

  useEffect(() => {
    api
      .getCustomRecords()
      .then((d) => setRecords(d.records ?? []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!form.domain.trim() || !form.value.trim()) return;
    setAdding(true);
    setAddErr("");
    try {
      const d = await api.addCustomRecord({ ...form, ttl: Number(form.ttl) });
      setRecords((p) => {
        const filtered = p.filter((r) => r.domain !== d.record.domain);
        return [...filtered, d.record];
      });
      setForm(EMPTY);
      toast(t("dns.record_saved", { type: form.type, domain: form.domain }));
    } catch (e) {
      setAddErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(domain: string) {
    if (!(await confirm(t("dns.remove_confirm", { domain })))) return;
    setRemoving(domain);
    try {
      await api.removeCustomRecord(domain);
      setRecords((p) => p.filter((r) => r.domain !== domain));
      toast(t("dns.record_removed", { domain }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRemoving("");
  }

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="p-6">
      {ConfirmDialog}
      <PageHeader title={t("dns.title")} subtitle={t("dns.subtitle")} />
      {err && <Err msg={err} />}

      {/* Add / update form */}
      <Card className="mb-4">
        <SectionLabel>{t("dns.add_or_update")}</SectionLabel>
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(12rem,1.1fr)_6rem_minmax(14rem,2fr)_6rem_auto]"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("dns.field_domain")}</span>
            <Input
              value={form.domain}
              onChange={set("domain")}
              placeholder="router.lan"
              className="w-full font-mono"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("dns.field_type")}</span>
            <Select value={form.type} onChange={set("type")} className="w-full">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("dns.field_value")}</span>
            <Input
              value={form.value}
              onChange={set("value")}
              placeholder="192.168.1.1"
              className="w-full font-mono"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("dns.field_ttl")}</span>
            <Input
              type="number"
              value={form.ttl}
              onChange={set("ttl")}
              className="w-full text-right font-mono tabular-nums"
            />
          </div>
          <Btn
            type="submit"
            disabled={adding || !form.domain.trim() || !form.value.trim()}
            className="h-8 justify-center"
          >
            <Plus size={12} />{" "}
            {records.some((r) => r.domain === form.domain) ? t("dns.update") : t("dns.add")}
          </Btn>
          {addErr && (
            <p className="text-blocked text-xs md:col-span-5 md:justify-self-end">{addErr}</p>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card className="p-0! overflow-x-auto">
        {loading && <Spinner />}
        {!loading && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-bdr border-b">
                <Th>{t("dns.col_domain")}</Th>
                <Th>{t("dns.col_type")}</Th>
                <Th>{t("dns.col_value")}</Th>
                <Th>{t("dns.col_ttl")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <EmptyRow cols={5} message={t("dns.no_records")} />
              ) : (
                records.map((r) => (
                  <TableRow
                    key={r.domain}
                    className={cn("cursor-pointer", form.domain === r.domain && "bg-ember/5")}
                    onClick={() =>
                      setForm({
                        domain: r.domain,
                        type: r.type,
                        value: r.value,
                        ttl: String(r.ttl),
                      })
                    }
                  >
                    <Td className="text-heading font-mono">{r.domain}</Td>
                    <Td>
                      <span
                        className={cn("font-mono font-semibold", TYPE_COLOR[r.type] ?? "text-body")}
                      >
                        {r.type}
                      </span>
                    </Td>
                    <Td className="text-body font-mono">{r.value}</Td>
                    <Td className="text-muted tabular-nums">{r.ttl}s</Td>
                    <Td className="text-right">
                      <IconBtn
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(r.domain);
                        }}
                        disabled={removing === r.domain}
                      >
                        <Trash2 size={13} />
                      </IconBtn>
                    </Td>
                  </TableRow>
                ))
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
