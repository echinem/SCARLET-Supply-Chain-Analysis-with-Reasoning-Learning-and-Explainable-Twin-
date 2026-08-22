import os
import json
import random
import numpy as np
import networkx as nx
from typing import List, Dict, Any, Tuple, Optional
from app.core.logging import logger

ACTIONS = ["STABLE", "REBALANCE", "REROUTE"]
ACTION_STABLE = 0
ACTION_REBALANCE = 1
ACTION_REROUTE = 2

Q_TABLE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "q_table.json")

def get_state(inventory: float, risk: float, capacity: float) -> Tuple[int, int]:
    """
    Maps continuous supply chain metrics into a discrete 2D state tuple: (inv_state, risk_state).
    - inv_state: 0 (Critical <20%), 1 (Alert 20%-70%), 2 (Surplus >70%)
    - risk_state: 0 (Low <0.3), 1 (Medium 0.3-0.6), 2 (High >0.6)
    """
    inv_ratio = inventory / capacity if capacity > 0 else 0.0
    inv_state = 0 if inv_ratio < 0.2 else (1 if inv_ratio < 0.7 else 2)
    risk_state = 0 if risk < 0.3 else (1 if risk < 0.6 else 2)
    return (inv_state, risk_state)

class QLearningAgent:
    def __init__(self, alpha: float = 0.1, gamma: float = 0.9, epsilon: float = 0.1, min_epsilon: float = 0.02, decay: float = 0.995):
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.min_epsilon = min_epsilon
        self.decay = decay
        self.q_table: Dict[str, List[float]] = {}
        self.load_or_train()

    def _state_key(self, state: Tuple[int, int]) -> str:
        return f"{state[0]}_{state[1]}"

    def _init_default_table(self) -> Dict[str, List[float]]:
        # Initialize 9 states (3x3) with baseline priors:
        # [STABLE, REBALANCE, REROUTE]
        return {
            "0_0": [1.0, 3.0, 0.0],   # Low inv, low risk -> REBALANCE preferred
            "0_1": [-0.5, 4.0, 1.0],  # Low inv, med risk -> REBALANCE strongly preferred
            "0_2": [-2.0, 5.0, 2.0],  # Low inv, high risk -> REBALANCE critically preferred
            "1_0": [2.0, 0.5, 0.0],   # Med inv, low risk -> STABLE preferred
            "1_1": [1.0, 2.0, 2.5],   # Med inv, med risk -> REROUTE / REBALANCE
            "1_2": [-1.0, 2.0, 4.5],  # Med inv, high risk -> REROUTE preferred
            "2_0": [3.0, 0.0, 0.0],   # Surplus inv, low risk -> STABLE preferred
            "2_1": [1.5, 0.5, 2.0],   # Surplus inv, med risk -> STABLE / REROUTE
            "2_2": [0.0, 1.0, 4.0],   # Surplus inv, high risk -> REROUTE preferred
        }

    def load_or_train(self):
        """Loads Q-table from disk or pre-trains on baseline episodes if missing."""
        if os.path.exists(Q_TABLE_PATH):
            try:
                with open(Q_TABLE_PATH, "r") as f:
                    self.q_table = json.load(f)
                logger.info(f"Loaded existing Q-table from {Q_TABLE_PATH}")
                return
            except Exception as e:
                logger.warning(f"Could not read {Q_TABLE_PATH}: {e}. Reinitializing.")

        logger.info("No valid Q-table found. Running pre-training routine...")
        self.q_table = self._init_default_table()
        train_q_learning_agent(self, episodes=400)

    def save_q_table(self):
        """Persists the current Q-table to disk."""
        try:
            with open(Q_TABLE_PATH, "w") as f:
                json.dump(self.q_table, f, indent=2)
            logger.info(f"Saved Q-table to {Q_TABLE_PATH}")
        except Exception as e:
            logger.error(f"Failed to save Q-table to {Q_TABLE_PATH}: {e}")

    def choose_action(self, state: Tuple[int, int], explore: bool = True) -> int:
        """Selects action index using epsilon-greedy policy."""
        s_key = self._state_key(state)
        if s_key not in self.q_table:
            self.q_table[s_key] = [0.0, 0.0, 0.0]

        if explore and random.random() < self.epsilon:
            return random.randint(0, len(ACTIONS) - 1)
        
        q_vals = self.q_table[s_key]
        return int(np.argmax(q_vals))

    def compute_reward(self, current_inv: float, current_risk: float, capacity: float, next_inv: float, next_risk: float, action_idx: int) -> float:
        """
        Calculates the supply chain performance reward for a state transition.
        """
        cap = max(1.0, capacity)
        inv_ratio = next_inv / cap
        
        # 1. Inventory Health Component
        if next_inv <= 0.0:
            inv_reward = -5.0 # Stockout catastrophe
        elif inv_ratio < 0.2:
            inv_reward = -2.5 # Critical shortage penalty
        elif 0.3 <= inv_ratio <= 0.8:
            inv_reward = 2.0  # Healthy operational band reward
        elif inv_ratio > 0.95:
            inv_reward = -1.0 # Buffer overflow risk
        else:
            inv_reward = 0.5

        # 2. Risk Mitigation Component
        risk_penalty = -3.0 * next_risk
        risk_improvement = (current_risk - next_risk) * 4.0 # Positive if risk dropped

        # 3. Action Churn / Operational Cost
        action_cost = 0.0 if action_idx == ACTION_STABLE else -0.05

        total_reward = inv_reward + risk_penalty + risk_improvement + action_cost
        return float(total_reward)

    def update(self, state: Tuple[int, int], action_idx: int, reward: float, next_state: Tuple[int, int]):
        """
        Executes the Bellman update rule:
        Q(s, a) <- Q(s, a) + alpha * [reward + gamma * max_a' Q(s', a') - Q(s, a)]
        """
        s_key = self._state_key(state)
        next_key = self._state_key(next_state)

        if s_key not in self.q_table:
            self.q_table[s_key] = [0.0, 0.0, 0.0]
        if next_key not in self.q_table:
            self.q_table[next_key] = [0.0, 0.0, 0.0]

        best_next_q = max(self.q_table[next_key])
        current_q = self.q_table[s_key][action_idx]

        # Bellman update
        new_q = current_q + self.alpha * (reward + self.gamma * best_next_q - current_q)
        self.q_table[s_key][action_idx] = round(float(new_q), 4)

        # Decay exploration rate
        self.epsilon = max(self.min_epsilon, self.epsilon * self.decay)

_global_agent: Optional[QLearningAgent] = None

def get_agent() -> QLearningAgent:
    """Returns the singleton Q-learning agent instance."""
    global _global_agent
    if _global_agent is None:
        _global_agent = QLearningAgent()
    return _global_agent

def train_q_learning_agent(agent: Optional[QLearningAgent] = None, episodes: int = 500) -> QLearningAgent:
    """
    Pre-trains the Q-learning agent across synthetic supply chain disruption episodes.
    """
    if agent is None:
        agent = QLearningAgent(alpha=0.15, gamma=0.9, epsilon=0.3)

    logger.info(f"Pre-training Q-learning agent over {episodes} episodes...")

    for ep in range(episodes):
        # Sample realistic initial node condition
        cap = random.choice([500.0, 1000.0, 2000.0])
        inv = random.uniform(0.0, cap)
        risk = random.uniform(0.0, 1.0)
        
        # Step through multiple time increments
        for _ in range(10):
            curr_state = get_state(inv, risk, cap)
            action_idx = agent.choose_action(curr_state, explore=True)
            
            # Simulate step dynamics
            prev_inv, prev_risk = inv, risk
            
            # Apply action effects
            if action_idx == ACTION_REBALANCE:
                inv = min(cap, inv + 25.0)
                risk = max(0.0, risk - 0.2)
            elif action_idx == ACTION_REROUTE:
                risk = max(0.0, risk - 0.15)
            
            # Simulate natural consumption and external disruption shock
            inv = max(0.0, inv - random.uniform(5.0, 20.0))
            if random.random() < 0.2:
                risk = min(1.0, risk + random.uniform(0.1, 0.4))
            else:
                risk = max(0.0, risk - 0.02)
                
            next_state = get_state(inv, risk, cap)
            reward = agent.compute_reward(prev_inv, prev_risk, cap, inv, risk, action_idx)
            agent.update(curr_state, action_idx, reward, next_state)

    agent.save_q_table()
    logger.info("Q-learning agent pre-training completed.")
    return agent

def compute_optimal_actions(G: nx.DiGraph, agent: Optional[QLearningAgent] = None, explore: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Evaluates nodes and edges in the NetworkX graph using the dynamic Q-Learning agent.
    Returns:
    - actions: list of executable actions and UI logs
    - step_records: dictionary storing (s_t, a_t, state data) for online Bellman updates
    """
    if agent is None:
        agent = get_agent()

    actions = []
    step_records = {}
    warehouse_nodes = [n for n in G.nodes() if G.nodes[n].get("label") == "Warehouse"]

    for n_id in G.nodes():
        node = G.nodes[n_id]
        label = node.get("label")
        name = node.get("name", n_id)

        # 1. Special Handling for Suppliers (Source nodes)
        if label == "Supplier":
            actions.append({"type": "log", "log": f"Supplier {name} | Upstream source - nominal flow"})
            continue

        # 2. Extract State and Choose Action via Q-Learning
        inv = node.get("inventory", 0.0)
        risk = node.get("risk_score", 0.0)
        cap = node.get("capacity", 100.0)
        state = get_state(inv, risk, cap)
        
        action_idx = agent.choose_action(state, explore=explore)
        choice = ACTIONS[action_idx]

        step_records[n_id] = {
            "state": state,
            "action_idx": action_idx,
            "prev_inv": inv,
            "prev_risk": risk,
            "capacity": cap
        }

        # 3. Decision Branch Execution
        if choice == "REBALANCE":
            best_wh = next((wh for wh in warehouse_nodes if G.nodes[wh].get("inventory", 0) > 50 and wh != n_id), None)
            if best_wh:
                actions.append({
                    "type": "rebalance_inventory",
                    "from_node": best_wh, 
                    "to_node": n_id, 
                    "amount": 25.0,
                    "log": f"{label} {name} | Q-LEARN [REBALANCE] - Rescuing with stock from {best_wh}"
                })
                # Local update to prevent duplicate over-allocation in the same tick
                G.nodes[best_wh]["inventory"] -= 25.0
            else:
                actions.append({
                    "type": "log", 
                    "log": f"{label} {name} | Q-LEARN [REBALANCE] - Critical inventory, awaiting donors"
                })

        elif choice == "REROUTE":
            # Find the most congested inbound edge
            target_edge = None
            max_c = -1
            for u, v in G.in_edges(n_id):
                c = G.edges[u, v].get("congestion", 0.0)
                if c > max_c:
                    max_c = c
                    target_edge = (u, v)
            
            if target_edge:
                actions.append({
                    "type": "reduce_congestion",
                    "edge": target_edge,
                    "amount": 0.2,
                    "log": f"{label} {name} | Q-LEARN [REROUTE] - Alleviating congestion on link {target_edge[0]}->{target_edge[1]}"
                })
            else:
                actions.append({
                    "type": "log", 
                    "log": f"{label} {name} | Q-LEARN [REROUTE] - Monitoring inbound edge flows"
                })
        
        else:
            # NOMINAL STATE (Action: STABLE)
            actions.append({
                "type": "log",
                "log": f"{label} {name} | Q-LEARN [STABLE] - State optimal"
            })

    return actions, step_records
