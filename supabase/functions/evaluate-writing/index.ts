import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured')

    const { essayText, taskType, prompt, testId, taskNumber, userId, imageUrl } = await req.json()

    // Validate required fields
    if (!essayText || !taskType) {
      throw new Error('Missing required fields: essayText and taskType are required')
    }

    // Create admin client for database operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. The "Strict Examiner" System Prompt
    const systemPrompt = `You are a Senior IELTS Examiner. Your marking is strict, objective, and follows the official Band Descriptors. 
Most AI models are too lenient; you must avoid this "niceness" bias. 

Follow these HARD CRITERIA CEILINGS:

1. TASK ACHIEVEMENT / RESPONSE:
   - [TASK 1] If there is NO clear overview (summary of main trends/differences), score MUST NOT exceed 5.0 for this category.
   - [TASK 1] If the student fails to accurately describe the key features shown in the image/chart/graph, score MUST NOT exceed 5.0.
   - [TASK 2] If the student addresses only part of the prompt (e.g., social but not practical problems), score MUST NOT exceed 5.0.
   - [TASK 2] If the position is not clear throughout or the conclusion contradicts the intro, score MUST NOT exceed 5.0.
   - [OFF-TOPIC] If the essay drifts significantly (e.g., discussing how to learn a language instead of the problems of living abroad), score MUST NOT exceed 4.0 or 5.0.

2. COHERENCE AND COHESION:
   - If there is no logical paragraphing, cap at 5.0.
   - If cohesive devices are overused, inaccurate, or repetitive (e.g., starting every sentence with 'And' or 'Then'), cap at 5.5.

3. LEXICAL RESOURCE & GRAMMAR:
   - Penalize "memorized" phrases or "big words" used incorrectly.
   - Accuracy is key. Frequent errors that distract the reader limit the score to 5.0.

Return ONLY a JSON object. No prose.
{
  "taskAchievement": { "score": number, "feedback": string, "ceilingReached": boolean, "reason": string },
  "coherenceCohesion": { "score": number, "feedback": string },
  "lexicalResource": { "score": number, "feedback": string },
  "grammarAccuracy": { "score": number, "feedback": string },
  "overallBand": number,
  "examinerNotes": "Internal critical reasoning for the final grade",
  "wordCount": number
}`;

    // Build messages based on whether we have a VALID image (Task 1 with chart/graph)
    let messages: any[];
    let model: string;

    // Check if imageUrl is valid (http/https URL or base64 data URL)
    const hasValidImageUrl = imageUrl && (
      imageUrl.startsWith('http://') || 
      imageUrl.startsWith('https://') || 
      imageUrl.startsWith('data:image/')
    );

    if (taskType === 'Task 1' && hasValidImageUrl) {
      // Use vision model for Task 1 with valid image
      model = 'meta-llama/llama-4-scout-17b-16e-instruct';
      messages = [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            {
              type: 'text',
              text: `TASK: ${taskType}\nPROMPT: ${prompt}\n\nSTUDENT ESSAY:\n${essayText}\n\nFirst, analyze the image (chart/graph/diagram) carefully. Then evaluate the student's essay strictly according to official IELTS standards. Check if the student accurately described the key features, trends, and comparisons shown in the image. Count words accurately.`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ];
    } else {
      // Use text-only model for Task 2 or Task 1 without valid image
      model = 'llama-3.3-70b-versatile';
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `TASK: ${taskType}\nPROMPT: ${prompt}\n\nSTUDENT ESSAY:\n${essayText}\n\nEvaluate strictly according to official standards. Count words accurately.` }
      ];
    }

    // 3. High-Precision API Call
    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1, // Near-zero temperature for strict, consistent grading
        max_tokens: 2000,
      })
    })

    const aiData = await aiResponse.json()
    
    if (!aiData.choices?.[0]?.message?.content) {
      console.error('AI Response Error:', aiData)
      throw new Error('Failed to get AI response: ' + (aiData.error?.message || 'No response content'))
    }
    
    // Parse JSON response with better error handling
    let evaluationJson;
    try {
      const rawContent = aiData.choices[0].message.content;
      // Remove markdown code blocks and clean up
      const cleanedContent = rawContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      evaluationJson = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError, 'Raw content:', aiData.choices[0].message.content);
      throw new Error('Failed to parse AI response as JSON. The AI may have returned an invalid format.');
    }

    // 4. Save to Database (if userId provided)
    if (userId) {
      const { error: dbError } = await adminClient
        .from('writing_evaluations')
        .insert({
          user_id: userId,
          test_id: testId,
          task_number: taskNumber,
          essay_text: essayText,
          evaluation: evaluationJson
        })

      if (dbError) console.error('Database Error:', dbError)
    }

    return new Response(JSON.stringify({ success: true, evaluation: evaluationJson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})