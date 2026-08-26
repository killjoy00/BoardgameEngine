const state = { players: "4", weight: "Medium" };

document.querySelectorAll(".segments").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state[group.id] = button.dataset.value;
  });
});

const time = document.querySelector("#time");
const output = document.querySelector("#time-output");
time.addEventListener("input", () => { output.value = `${time.value} min`; });

const games = { Light: "Cascadia", Medium: "Concordia", Heavy: "Brass: Birmingham", Any: "The Crew" };
document.querySelector("#picker-form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#result-title").textContent = games[state.weight];
  document.querySelector("#result-reason").textContent = `Strong at ${state.players} players · ${state.weight} weight · Under ${time.value} min`;
  document.querySelector("#result").hidden = false;
});

document.querySelector("#close").addEventListener("click", () => { document.querySelector("#result").hidden = true; });
document.querySelector("#year").textContent = new Date().getFullYear();
