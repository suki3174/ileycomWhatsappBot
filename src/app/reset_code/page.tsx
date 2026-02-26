"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import styles from "./resetCode.module.css"; 

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);

    // 1. Updated Validation: Must be exactly 4 digits
    const pinRegex = /^[0-9]{4}$/;
    if (!pinRegex.test(password)) {
      setError("Le code PIN doit contenir exactement 4 chiffres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les codes PIN ne correspondent pas.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/seller/authFlow/reset_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la mise à jour.");

      setMessage("Code PIN mis à jour avec succès 🎉");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Nouveau Code PIN</h1>
        <p className={styles.subtitle}>Entrez votre nouveau code à 4 chiffres.</p>

        <input
          type="text" // Use text with inputMode for better mobile number pad support
          inputMode="numeric"
          maxLength={4}
          placeholder="Nouveau code PIN (4 chiffres)"
          value={password}
          onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))} // Only allow numbers
        />

        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="Confirmer le code PIN"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, ""))}
        />

        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.success}>{message}</div>}

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Mise à jour..." : "Mettre à jour"}
        </button>
      </div>
    </div>
  );
}