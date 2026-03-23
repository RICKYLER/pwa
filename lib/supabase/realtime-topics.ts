import type { User } from '@/lib/db/schema';

function uniqueTopics(topics: Array<string | null | undefined>) {
  return [...new Set(topics.filter((topic): topic is string => typeof topic === 'string' && topic.length > 0))];
}

export function getRealtimeTopicsForUser(user: User | null | undefined): string[] {
  if (!user) {
    return [];
  }

  const topics = ['global:programs'];

  switch (user.role) {
    case 'admin':
      return uniqueTopics([
        ...topics,
        'role:admin:registry',
        'role:admin:inventory',
        'role:admin:distribution',
        'role:admin:incidents',
        'role:admin:audit',
      ]);
    case 'encoder':
      return uniqueTopics([
        ...topics,
        `barangay:${user.barangay_id}:registry`,
        'role:admin_encoder:inventory',
        'role:admin_encoder:distribution',
        'role:incident_staff:incidents',
      ]);
    case 'health_worker':
      return uniqueTopics([
        ...topics,
        `barangay:${user.barangay_id}:registry`,
        'role:incident_staff:incidents',
      ]);
    case 'responder':
      return uniqueTopics([
        ...topics,
        `barangay:${user.barangay_id}:registry`,
        'role:incident_staff:incidents',
      ]);
    case 'resident':
      return uniqueTopics([
        ...topics,
        `user:${user.id}:registry`,
        `user:${user.id}:audit`,
      ]);
    default:
      return uniqueTopics(topics);
  }
}
