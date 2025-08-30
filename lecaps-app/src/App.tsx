import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"

/* ============= Helpers ============= */
function diffDaysUTC(a: Date, b: Date) {
  const ms =
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)))
}
function fmtPct(x: number | null | undefined) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return (x * 100).toFixed(2) + "%"
}
function fmtNumber(x: number | null | undefined, decimals = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return Number(x).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Cálculos:
 * P   = cantidad * precio_compra
 * VF  = cantidad * precio_finish
 * días = fecha_finish - fecha_compra
 * TNA ≈ ((VF - P) / P) * (365 / días)
 * TEA = (VF / P)^(365 / días) - 1
 * YTM ≈ TEA (bullet)
 */
function computeMetrics(row: any) {
  const cantidad = Number(row.cantidad || 0)
  const pc = Number(row.precio_compra || 0)
  const pf = Number(row.precio_finish || 0)
  const P = cantidad * pc
  const VF = cantidad * pf

  const d0 = row.fecha_compra ? new Date(row.fecha_compra) : new Date()
  const d1 = row.fecha_finish ? new Date(row.fecha_finish) : new Date()
  const dias = diffDaysUTC(d1, d0)

  if (P <= 0 || VF <= 0) {
    return { dias, P: 0, VF: 0, tna: NaN, tea: NaN, ytm: NaN, ret: NaN }
  }

  const ret = (VF - P) / P
  const tna = ret * (365 / dias)
  const tea = Math.pow(VF / P, 365 / dias) - 1
  const ytm = tea
  return { dias, P, VF, tna, tea, ytm, ret }
}

/* ============= App ============= */
export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-700">
        Cargando…
      </div>
    )
  }

  if (!session) return <AuthScreen />
  return <Dashboard user={session.user} />
}

/* ============= Auth Screen ============= */
function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg("Revisá tu mail para confirmar la cuenta.")
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setMsg(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900 text-center">
          LECAPs – Acceso
        </h1>
        <div className="flex gap-2 justify-center text-sm">
          <button
            className={`px-3 py-1 rounded-full ${
              mode === "signin"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-800"
            }`}
            onClick={() => setMode("signin")}
          >
            Iniciar sesión
          </button>
          <button
            className={`px-3 py-1 rounded-full ${
              mode === "signup"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-800"
            }`}
            onClick={() => setMode("signup")}
          >
            Crear cuenta
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
          <input
            required
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />
          <button
            disabled={busy}
            className="w-full rounded-xl py-2 bg-black text-white shadow"
          >
            {busy ? "Procesando…" : mode === "signup" ? "Registrarme" : "Entrar"}
          </button>
          {msg && <p className="text-sm text-center text-red-600">{msg}</p>}
        </form>
      </div>
    </div>
  )
}

/* ============= Dashboard ============= */
function Dashboard({ user }: { user: any }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({
    ticker: "",
    precio_compra: "",
    precio_finish: "",
    fecha_compra: "",
    fecha_finish: "",
    cantidad: "",
  })

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .order("fecha_finish", { ascending: true })
    if (error) console.error(error)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function addRow(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      ticker: form.ticker.trim(),
      precio_compra: Number(form.precio_compra) || 0,
      precio_finish: Number(form.precio_finish) || 0,
      fecha_compra: form.fecha_compra,
      fecha_finish: form.fecha_finish,
      cantidad: Number(form.cantidad) || 0,
      user_id: user.id,
    }
    if (!payload.ticker) return alert("Falta el ticker")
    if (!payload.precio_compra || !payload.precio_finish)
      return alert("Cargá precios válidos")
    const { error } = await supabase.from("holdings").insert(payload)
    if (error) return alert(error.message)
    setForm({
      ticker: "",
      precio_compra: "",
      precio_finish: "",
      fecha_compra: "",
      fecha_finish: "",
      cantidad: "",
    })
    load()
  }

  async function removeRow(id: string) {
    const ok = confirm("¿Eliminar registro?")
    if (!ok) return
    const { error } = await supabase
      .from("holdings")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
    if (error) return alert(error.message)
    load()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const totals = useMemo(() => {
    let inv = 0,
      vf = 0
    rows.forEach((r) => {
      const m = computeMetrics(r)
      inv += m.P
      vf += m.VF
    })
    const diff = vf - inv
    return { inv, vf, diff }
  }, [rows])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 md:px-8 py-3 bg-white border-b">
        <div>
          <h1 className="text-xl font-semibold">Tus Letras</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-xl bg-gray-100"
          >
            Actualizar
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-xl bg-black text-white"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <section className="grid md:grid-cols-3 gap-4">
          <Card title="Invertido">${fmtNumber(totals.inv)}</Card>
          <Card title="Valor a Finish">${fmtNumber(totals.vf)}</Card>
          <Card title="Resultado Bruto">${fmtNumber(totals.diff)}</Card>
        </section>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Agregar compra</h2>
          <form onSubmit={addRow} className="grid md:grid-cols-12 gap-3">
            <input
              className="border rounded-xl px-3 py-2 md:col-span-2"
              placeholder="Ticker (S12S5...)"
              value={form.ticker}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, ticker: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="0.01"
              placeholder="Precio compra"
              value={form.precio_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, precio_compra: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="0.01"
              placeholder="Precio finish"
              value={form.precio_finish}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, precio_finish: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="date"
              value={form.fecha_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, fecha_compra: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="date"
              value={form.fecha_finish}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, fecha_finish: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="1"
              placeholder="Cantidad letras"
              value={form.cantidad}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, cantidad: e.target.value }))
              }
            />
            <button className="rounded-xl px-3 py-2 bg-black text-white md:col-span-2">
              Agregar
            </button>
          </form>
        </section>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Posición</h2>
          {rows.length === 0 && (
            <p className="text-sm text-gray-500">No hay registros todavía.</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b">
                  <tr className="[&>th]:py-2 [&>th]:pr-3">
                    <th>Ticker</th>
                    <th>Compra</th>
                    <th>Finish</th>
                    <th>Cant.</th>
                    <th>Invertido</th>
                    <th>Valor Finish</th>
                    <th>Días</th>
                    <th>TNA</th>
                    <th>TEA</th>
                    <th>YTM</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const m = computeMetrics(r)
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-0 [&>td]:py-2 [&>td]:pr-3"
                      >
                        <td className="font-medium">{r.ticker}</td>
                        <td>{fmtNumber(r.precio_compra)}</td>
                        <td>{fmtNumber(r.precio_finish)}</td>
                        <td>{fmtNumber(r.cantidad, 0)}</td>
                        <td>{fmtNumber(m.P)}</td>
                        <td>{fmtNumber(m.VF)}</td>
                        <td>{m.dias}</td>
                        <td>{fmtPct(m.tna)}</td>
                        <td>{fmtPct(m.tea)}</td>
                        <td>{fmtPct(m.ytm)}</td>
                        <td>
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-red-600"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="text-xs text-gray-500">
          <p>
            Fórmulas: Invertido = cantidad × precio_compra. Valor a Finish =
            cantidad × precio_finish. TNA ≈ ((VF−P)/P)×(365/días). TEA =
            (VF/P)^(365/días) − 1. YTM ≈ TEA. No incluye gastos/impuestos.
          </p>
        </section>
      </main>
    </div>
  )
}

/* ============= UI helper ============= */
function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{children}</div>
    </div>
  )
}
