const btnPonto = document.getElementById("btnPonto");
const status = document.getElementById("status");
const historico = document.getElementById("historico");

let checkedIn = false;

function formatarHorario(data) {
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function registrarPonto() {
  const agora = new Date();
  const horario = formatarHorario(agora);

  checkedIn = !checkedIn;

  const item = document.createElement("li");
  const tipoSpan = document.createElement("span");
  tipoSpan.textContent = checkedIn ? "Check-in" : "Check-out";
  tipoSpan.className = checkedIn ? "tipo--in" : "tipo--out";

  const horaSpan = document.createElement("span");
  horaSpan.textContent = horario;

  item.appendChild(tipoSpan);
  item.appendChild(horaSpan);
  historico.prepend(item);

  if (checkedIn) {
    btnPonto.textContent = "Check-out";
    btnPonto.classList.remove("btn--checkin");
    btnPonto.classList.add("btn--checkout");
    status.textContent = `Em expediente desde ${horario}`;
    status.classList.remove("status--out");
    status.classList.add("status--in");
  } else {
    btnPonto.textContent = "Check-in";
    btnPonto.classList.remove("btn--checkout");
    btnPonto.classList.add("btn--checkin");
    status.textContent = `Fora do expediente desde ${horario}`;
    status.classList.remove("status--in");
    status.classList.add("status--out");
  }
}

btnPonto.addEventListener("click", registrarPonto);
