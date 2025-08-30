import React, { useEffect, useMemo, useState } from "react"
import { createClient } from "@supabase/supabase-js"

// 🔑 Cliente Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabase = createClient(supabaseUrl, supabaseAnon)

// Utilidades
function diffDaysUTC(a: Date, b: Date) {
  const ms =
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function fmtPct(x: number | null | undefined) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return (x * 100).toFixed(2) + "%"
}

function fmtNumber(x: number | null | undefined, decimals = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return x.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function computeMetrics({
  precio_compra,
  cantidad,
  valor_nominal,
  vencimiento,
  fecha_compra,
}: any) {
  const P = Number(precio_compra) * Number(cantidad) // precio por VN100 * cantidad
  const VN = Number(valor_nominal || 100) * Number(cantidad)
  const d0 = fecha_compra ? new Date(fecha_compra) : new Date()
  const d1 = vencimiento ? new Date(vencimiento) : new Date()
  const dias = Math.max(1, diffDaysUTC(d1, d0))
  const tna = ((VN - P) / P) * (365 / dias)
  const tea = Math.pow(VN / P, 365 / dias) - 1
  const ytm = tea
  return { dias, P, VN, tna, tea, ytm }
}

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

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-gray-700">
        Cargando…
      </div>
    )

  if (!session) return <AuthScreen />
  return <Dashboard user={session.user} />
}

// 🔐 Pantalla de login/registro
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

// 📊 Dashboard
function Dashboard({ user }: { user: any }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({
    especie: "LECAP",
    vencimiento: "",
    valor_nominal: 100,
    cantidad: 1,
    precio_compra: "",
    fecha_compra: "",
    broker: "",
    notas: "",
  })

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .order("vencimiento", { ascending: true })
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
      ...form,
      valor_nominal: Number(form.valor_nominal) || 100,
      cantidad: Number(form.cantidad) || 0,
      precio_compra: Number(form.precio_compra) || 0,
      user_id: user.id,
    }
    const { error } = await supabase.from("holdings").insert(payload)
    if (error) return alert(error.message)
    setForm({
      especie: "LECAP",
      vencimiento: "",
      valor_nominal: 100,
      cantidad: 1,
      precio_compra: "",
      fecha_compra: "",
      broker: "",
      notas: "",
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
      vn = 0
    rows.forEach((r) => {
      const m = computeMetrics(r)
      inv += m.P
      vn += m.VN
    })
    const diff = vn - inv
    return { inv, vn, diff }
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
          <Card title="Valor a Vencimiento (VN)">${fmtNumber(totals.vn)}</Card>
          <Card title="Resultado Bruto">${fmtNumber(totals.diff)}</Card>
        </section>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Agregar compra</h2>
          <form onSubmit={addRow} className="grid md:grid-cols-8 gap-3">
            <input
              className="border rounded-xl px-3 py-2 md:col-span-2"
              placeholder="Especie"
              value={form.especie}
              onChange={(e) => setForm((f: any) => ({ ...f, especie: e.target.value }))}
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="date"
              value={form.vencimiento}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, vencimiento: e.target.value }))
              }
            />
            <input
              className="border rounded-xl px-3 py-2"
              type="number"
              step="0.01"
              placeholder="VN"
              value={form.valor_nominal}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, valor_nominal: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2"
              type="number"
              step="0.01"
              placeholder="Cant."
              value={form.cantidad}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, cantidad: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2"
              type="number"
              step="0.01"
              placeholder="Precio x VN100"
              value={form.precio_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, precio_compra: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2"
              type="date"
              value={form.fecha_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, fecha_compra: e.target.value }))
              }
            />
            <button className="rounded-xl px-3 py-2 bg-black text-white">
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
                    <th>Especie</th>
                    <th>Venc.</th>
                    <th>Días</th>
                    <th>VN</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Invertido</th>
                    <th>VN Total</th>
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
                        <td className="font-medium">{r.especie}</td>
                        <td>{new Date(r.vencimiento).toLocaleDateString()}</td>
                        <td>{m.dias}</td>
                        <td>{fmtNumber(Number(r.valor_nominal))}</td>
                        <td>{fmtNumber(Number(r.cantidad), 0)}</td>
                        <td>{fmtNumber(Number(r.precio_compra))}</td>
                        <td>{fmtNumber(m.P)}</td>
                        <td>{fmtNumber(m.VN)}</td>
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
      </main>
    </div>
  )
}

// 📦 Card helper
function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{children}</div>
    </div>
  )
}
